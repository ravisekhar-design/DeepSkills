"use client";

/**
 * LAYER: Frontend — Dashboard Editor
 * Tableau-style: persistent right-side chart panel, drag-to-reorder widgets,
 * cross-filter, per-widget refresh, width toggle, and export.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Plus, Trash2, BarChart2,
  Filter as FilterIcon, RefreshCw, Square, Columns as ColumnsIcon,
  Maximize2, X, Search, Layers, LayoutDashboard, Download,
  GripVertical, PanelRight, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { worksheetClientService } from "@/services/worksheet.service";
import { semanticClientService } from "@/services/semantic.service";
import { ChartRenderer } from "@/components/chart-renderer";
import type { Worksheet } from "@/lib/worksheet/types";
import type { SemanticModel } from "@/lib/semantic/types";
import type { GeneratedChartConfig } from "@/ai/flows/chart-generation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardWidget {
  id: string;
  dashboardId: string;
  title: string;
  chartType: string;
  chartConfig: GeneratedChartConfig;
  dataSourceType: string;
  dataSourceId: string;
  dataSourceName: string;
  prompt?: string;
  gridW: number;
  createdAt: number;
}

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
}

const PALETTE = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];

// ── Export helpers ────────────────────────────────────────────────────────────

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function exportElement(
  el: HTMLElement,
  format: "png" | "jpeg" | "pdf" | "docx",
  name: string,
  onError: (msg: string) => void,
) {
  try {
    const { default: html2canvas } = await import("html2canvas" as any);
    const canvas = await (html2canvas as any)(el, {
      scale: 2, useCORS: true, logging: false, backgroundColor: "#0f0f1a",
    });
    if (format === "png") { triggerDownload(canvas.toDataURL("image/png"), `${name}.png`); return; }
    if (format === "jpeg") { triggerDownload(canvas.toDataURL("image/jpeg", 0.92), `${name}.jpg`); return; }
    if (format === "pdf") {
      const { default: jsPDF } = await import("jspdf" as any);
      const w = canvas.width / 2; const h = canvas.height / 2;
      const pdf = new (jsPDF as any)({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
      pdf.save(`${name}.pdf`); return;
    }
    if (format === "docx") {
      const { Document, Packer, Paragraph, ImageRun, HeadingLevel } = await import("docx" as any);
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
      const scaledH = Math.round(600 * (canvas.height / canvas.width));
      const doc = new (Document as any)({
        sections: [{ children: [
          new (Paragraph as any)({ text: name, heading: (HeadingLevel as any).HEADING_1 }),
          new (Paragraph as any)({ children: [new (ImageRun as any)({ data: array.buffer, transformation: { width: 600, height: scaledH }, type: "png" })] }),
        ]}],
      });
      const blob = await (Packer as any).toBlob(doc);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${name}.docx`);
      URL.revokeObjectURL(url);
    }
  } catch (e: any) { onError(e?.message ?? "Export failed"); }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [loading, setLoading] = useState(true);

  // Cross-filter state
  const [crossFilter, setCrossFilter] = useState<{ column: string; value: string } | null>(null);

  // Right panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [worksheetSearch, setWorksheetSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  // Per-widget loading
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Widget drag-reorder (client-side; order persists in state for current session)
  const [widgetOrder, setWidgetOrder] = useState<string[]>([]);
  const dragItemRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, wsList, modelList] = await Promise.all([
        fetch(`/api/dashboards/${id}`).then(r => r.json()),
        worksheetClientService.getAll(),
        semanticClientService.getAll().catch(() => [] as SemanticModel[]),
      ]);
      const dash: Dashboard | null = dashRes.data ?? null;
      setDashboard(dash);
      setWidgetOrder(dash?.widgets?.map(w => w.id) ?? []);
      setWorksheets(wsList);
      setModels(modelList);
    } catch {
      toast({ title: "Failed to load dashboard", variant: "destructive" });
    }
    setLoading(false);
  }, [id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Sorted widgets (respects drag reorder) ─────────────────────────────────

  const sortedWidgets = useMemo(() => {
    if (!dashboard) return [];
    const orderMap = new Map(widgetOrder.map((wid, i) => [wid, i]));
    return [...dashboard.widgets].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return ai - bi;
    });
  }, [dashboard?.widgets, widgetOrder]); // eslint-disable-line

  // ── Add chart from panel ───────────────────────────────────────────────────

  const addWorksheetWidget = async (ws: Worksheet) => {
    if (!dashboard || addingId) return;
    setAddingId(ws.id);
    try {
      const result = await worksheetClientService.execute(ws.id);
      const cfg = ws.config;
      const isHoriz = cfg.chartType === "horizontal_bar";
      const dimCols = isHoriz ? cfg.rows : cfg.columns;
      const measCols = isHoriz ? cfg.columns : cfg.rows;
      const series = measCols.filter(p => p.role === "measure").map((p, i) => ({
        dataKey: p.alias || `${p.aggregation ?? "sum"}_${p.fieldName}`,
        name: `${p.aggregation ?? "sum"}(${p.displayName})`,
        color: PALETTE[i % PALETTE.length],
      }));
      const chartConfig: GeneratedChartConfig = {
        title: ws.name,
        chartType: cfg.chartType as any,
        xKey: dimCols[0]?.fieldName ?? "",
        series,
        data: result.rows ?? [],
        sql: null,
      };
      const res = await fetch(`/api/dashboards/${dashboard.id}/widgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ws.name,
          chartType: cfg.chartType,
          chartConfig,
          dataSourceType: "worksheet",
          dataSourceId: ws.id,
          dataSourceName: ws.name,
          gridW: 1,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setDashboard(prev => prev ? { ...prev, widgets: [...prev.widgets, json.data] } : prev);
        setWidgetOrder(prev => [...prev, json.data.id]);
        toast({ title: `"${ws.name}" added to dashboard` });
      } else {
        toast({ title: "Failed to add chart", description: json.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Failed to add chart", description: e?.message, variant: "destructive" });
    }
    setAddingId(null);
  };

  // ── Refresh widget ─────────────────────────────────────────────────────────

  const refreshWidget = async (widget: DashboardWidget) => {
    if (widget.dataSourceType !== "worksheet" || !dashboard || refreshingId) return;
    setRefreshingId(widget.id);
    try {
      const result = await worksheetClientService.execute(widget.dataSourceId);
      const newConfig = { ...widget.chartConfig, data: result.rows };
      await fetch(`/api/dashboards/${dashboard.id}/widgets?widgetId=${widget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartConfig: newConfig }),
      });
      setDashboard(prev => prev ? {
        ...prev,
        widgets: prev.widgets.map(w => w.id === widget.id ? { ...w, chartConfig: newConfig } : w),
      } : prev);
      toast({ title: `"${widget.title}" refreshed` });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e?.message, variant: "destructive" });
    }
    setRefreshingId(null);
  };

  const refreshAll = async () => {
    if (!dashboard) return;
    for (const w of sortedWidgets) {
      if (w.dataSourceType === "worksheet") await refreshWidget(w);
    }
  };

  // ── Delete / width toggle ──────────────────────────────────────────────────

  const deleteWidget = async (widgetId: string) => {
    if (!dashboard) return;
    await fetch(`/api/dashboards/${dashboard.id}/widgets?widgetId=${widgetId}`, { method: "DELETE" });
    setDashboard(prev => prev ? { ...prev, widgets: prev.widgets.filter(w => w.id !== widgetId) } : prev);
    setWidgetOrder(prev => prev.filter(wid => wid !== widgetId));
  };

  const toggleWidth = async (widget: DashboardWidget) => {
    if (!dashboard) return;
    const newW = widget.gridW === 2 ? 1 : 2;
    await fetch(`/api/dashboards/${dashboard.id}/widgets?widgetId=${widget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gridW: newW }),
    });
    setDashboard(prev => prev ? {
      ...prev,
      widgets: prev.widgets.map(w => w.id === widget.id ? { ...w, gridW: newW } : w),
    } : prev);
  };

  // ── Rename dashboard ───────────────────────────────────────────────────────

  const renameDashboard = async (name: string) => {
    if (!dashboard || !name.trim() || name.trim() === dashboard.name) return;
    await fetch(`/api/dashboards/${dashboard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setDashboard({ ...dashboard, name: name.trim() });
  };

  // ── Cross-filter ───────────────────────────────────────────────────────────

  const handleChartClick = useCallback((column: string, value: string | number) => {
    if (!column) return;
    const sv = String(value);
    setCrossFilter(prev => prev?.column === column && prev?.value === sv ? null : { column, value: sv });
  }, []);

  const applyCrossFilter = (config: GeneratedChartConfig): GeneratedChartConfig => {
    if (!crossFilter) return config;
    if (!config.data?.some(r => crossFilter.column in r)) return config;
    return { ...config, data: config.data.filter(r => String(r[crossFilter.column]) === crossFilter.value) };
  };

  // ── Drag-to-reorder ────────────────────────────────────────────────────────

  const handleWidgetDragStart = (e: React.DragEvent, widgetId: string) => {
    dragItemRef.current = widgetId;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleWidgetDragOver = (e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragItemRef.current !== widgetId) setDragOverId(widgetId);
  };

  const handleWidgetDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragItemRef.current;
    if (!sourceId || sourceId === targetId) { setDragOverId(null); return; }
    setWidgetOrder(prev => {
      const order = [...prev];
      const si = order.indexOf(sourceId);
      const ti = order.indexOf(targetId);
      if (si === -1 || ti === -1) return prev;
      order.splice(si, 1);
      order.splice(ti, 0, sourceId);
      return order;
    });
    setDragOverId(null);
    dragItemRef.current = null;
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async (format: "png" | "jpeg" | "pdf" | "docx") => {
    if (!gridRef.current || !dashboard) return;
    setExporting(format);
    await exportElement(
      gridRef.current, format, dashboard.name,
      msg => toast({ title: "Export failed", description: msg, variant: "destructive" }),
    );
    setExporting(null);
  };

  // ── Filtered worksheet list for panel ─────────────────────────────────────

  const filteredWorksheets = useMemo(
    () => worksheets.filter(w => w.name.toLowerCase().includes(worksheetSearch.toLowerCase())),
    [worksheets, worksheetSearch],
  );

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-accent" />
      </div>
    );
  }
  if (!dashboard) {
    return (
      <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">
        Dashboard not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-border px-4 py-2.5 flex items-center gap-3 bg-background/80 backdrop-blur shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/visualize")}>
          <ArrowLeft className="size-4" />
        </Button>
        <LayoutDashboard className="size-4 text-accent shrink-0" />
        <Input
          defaultValue={dashboard.name}
          onBlur={e => renameDashboard(e.target.value)}
          className="h-7 text-base font-semibold border-0 px-1 max-w-md focus-visible:ring-1"
        />
        <Badge variant="outline" className="text-[10px] shrink-0">
          {sortedWidgets.length} chart{sortedWidgets.length !== 1 ? "s" : ""}
        </Badge>

        {/* Active cross-filter indicator */}
        {crossFilter && (
          <Badge
            variant="outline"
            className="text-[10px] gap-1 text-accent border-accent/40 cursor-pointer shrink-0"
            onClick={() => setCrossFilter(null)}
          >
            <FilterIcon className="size-2.5" />
            {crossFilter.column} = {crossFilter.value}
            <X className="size-2.5" />
          </Badge>
        )}

        <div className="flex-1" />

        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={refreshAll}>
          <RefreshCw className="size-3.5" /> Refresh All
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8"
              disabled={sortedWidgets.length === 0 || !!exporting}
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("png")}>PNG Image</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("jpeg")}>JPEG Image</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport("pdf")}>PDF Document</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("docx")}>Word Document (.docx)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Panel toggle */}
        <Button
          size="sm"
          variant={panelOpen ? "default" : "outline"}
          className="gap-1.5 h-8"
          onClick={() => setPanelOpen(v => !v)}
        >
          <PanelRight className="size-3.5" />
          {panelOpen ? "Close Panel" : "Add Charts"}
        </Button>
      </div>

      {/* ── Body: Grid + Right Panel ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Dashboard grid */}
        <ScrollArea className="flex-1">
          <div ref={gridRef} className="p-4 min-h-full">
            {sortedWidgets.length === 0 ? (
              <EmptyDashboard onOpen={() => setPanelOpen(true)} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedWidgets.map(widget => (
                  <WidgetCard
                    key={widget.id}
                    widget={widget}
                    isDragOver={dragOverId === widget.id}
                    isRefreshing={refreshingId === widget.id}
                    crossFilteredConfig={applyCrossFilter(widget.chartConfig)}
                    onRefresh={() => refreshWidget(widget)}
                    onDelete={() => deleteWidget(widget.id)}
                    onToggleWidth={() => toggleWidth(widget)}
                    onChartClick={handleChartClick}
                    onDragStart={e => handleWidgetDragStart(e, widget.id)}
                    onDragOver={e => handleWidgetDragOver(e, widget.id)}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={e => handleWidgetDrop(e, widget.id)}
                    onDragEnd={() => { setDragOverId(null); dragItemRef.current = null; }}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div
          className={`flex flex-col bg-sidebar/50 shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
            panelOpen ? "w-[380px] border-l border-border" : "w-0"
          }`}
        >
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="size-4 text-accent" /> Add Charts
              </h3>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => setPanelOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={worksheetSearch}
                onChange={e => setWorksheetSearch(e.target.value)}
                placeholder="Search charts…"
                className="h-8 pl-8 text-sm"
              />
              {worksheetSearch && (
                <button
                  onClick={() => setWorksheetSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* Panel count */}
          <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold shrink-0">
            {filteredWorksheets.length} chart{filteredWorksheets.length !== 1 ? "s" : ""}
            {worksheetSearch ? " found" : " available"}
          </p>

          {/* Chart list */}
          <ScrollArea className="flex-1">
            <div className="px-3 pb-4 space-y-1.5">
              {filteredWorksheets.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <BarChart2 className="size-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No charts found.</p>
                  <Link
                    href="/visualize"
                    className="text-accent text-xs underline mt-1 inline-block"
                  >
                    Build a chart first →
                  </Link>
                </div>
              ) : (
                filteredWorksheets.map(ws => (
                  <ChartPanelCard
                    key={ws.id}
                    worksheet={ws}
                    modelName={models.find(m => m.id === ws.modelId)?.name}
                    isAdding={addingId === ws.id}
                    disabled={!!addingId}
                    onAdd={() => addWorksheetWidget(ws)}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Panel footer hint */}
          <div className="px-4 py-3 border-t border-border shrink-0">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              Drag chart cards on the dashboard to reorder them.
              Click the width icon to span a chart full width.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyDashboard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
      <div className="p-4 rounded-2xl bg-muted/30 border border-border mb-4">
        <LayoutDashboard className="size-10 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">No charts on this dashboard yet</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Open the Charts panel to add saved charts to this dashboard.
      </p>
      <Button onClick={onOpen} className="gap-1.5">
        <Plus className="size-4" /> Add Charts
      </Button>
    </div>
  );
}

// ── Chart panel card ──────────────────────────────────────────────────────────

function ChartPanelCard({
  worksheet,
  modelName,
  isAdding,
  disabled,
  onAdd,
}: {
  worksheet: Worksheet;
  modelName?: string;
  isAdding: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors group">
      {/* Left: chart type icon */}
      <div className="size-8 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
        <BarChart2 className="size-4 text-accent" />
      </div>

      {/* Middle: info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{worksheet.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <Badge variant="outline" className="text-[9px] font-mono h-4 px-1">
            {worksheet.config.chartType}
          </Badge>
          {modelName && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate">
              <Box className="size-2.5 shrink-0" />
              <span className="truncate">{modelName}</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Link href={`/visualize/worksheets/${worksheet.id}`} tabIndex={-1}>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit chart"
          >
            <Maximize2 className="size-3" />
          </Button>
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs gap-1"
          onClick={onAdd}
          disabled={disabled}
          title="Add to dashboard"
        >
          {isAdding ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          Add
        </Button>
      </div>
    </div>
  );
}

// ── Widget card ───────────────────────────────────────────────────────────────

function WidgetCard({
  widget,
  isDragOver,
  isRefreshing,
  crossFilteredConfig,
  onRefresh,
  onDelete,
  onToggleWidth,
  onChartClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  widget: DashboardWidget;
  isDragOver: boolean;
  isRefreshing: boolean;
  crossFilteredConfig: GeneratedChartConfig;
  onRefresh: () => void;
  onDelete: () => void;
  onToggleWidth: () => void;
  onChartClick: (col: string, val: string | number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <Card
      className={`transition-all duration-150 ${widget.gridW === 2 ? "md:col-span-2" : ""} ${
        isDragOver
          ? "border-accent ring-1 ring-accent/30 bg-accent/5 scale-[0.99]"
          : "hover:border-accent/30"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0 gap-2">

        {/* Drag handle + title (draggable area) */}
        <div
          className="flex items-start gap-2 flex-1 min-w-0 cursor-grab active:cursor-grabbing select-none"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <GripVertical className="size-4 text-muted-foreground/30 shrink-0 mt-0.5 hover:text-muted-foreground/70 transition-colors" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">{widget.title}</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
              {widget.dataSourceType === "worksheet"
                ? <BarChart2 className="size-2.5 shrink-0" />
                : <Layers className="size-2.5 shrink-0" />}
              <span className="truncate">{widget.dataSourceName}</span>
            </p>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Badge variant="outline" className="text-[9px] font-mono mr-1">{widget.chartType}</Badge>

          {widget.dataSourceType === "worksheet" && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              title="Refresh data"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing
                ? <Loader2 className="size-3 animate-spin" />
                : <RefreshCw className="size-3" />}
            </Button>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            title={widget.gridW === 2 ? "Switch to half width" : "Switch to full width"}
            onClick={onToggleWidth}
          >
            {widget.gridW === 2 ? <Square className="size-3" /> : <ColumnsIcon className="size-3" />}
          </Button>

          {widget.dataSourceType === "worksheet" && (
            <Link href={`/visualize/worksheets/${widget.dataSourceId}`}>
              <Button size="icon" variant="ghost" className="size-7" title="Edit chart">
                <Maximize2 className="size-3" />
              </Button>
            </Link>
          )}

          <Button
            size="icon"
            variant="ghost"
            className="size-7 hover:text-destructive"
            title="Remove from dashboard"
            onClick={onDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ChartRenderer
          config={crossFilteredConfig}
          height={260}
          onDataPointClick={onChartClick}
        />
      </CardContent>
    </Card>
  );
}
