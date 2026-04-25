"use client";

/**
 * LAYER: Frontend — Dashboard Editor
 * Compose multiple worksheets into a dashboard with global filters and cross-filtering.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Save, Plus, Trash2, BarChart2, Sparkles,
  Filter as FilterIcon, RefreshCw, Square, Columns as ColumnsIcon,
  Maximize2, X, Search, AlertCircle, Layers, LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { worksheetClientService } from "@/services/worksheet.service";
import { ChartRenderer } from "@/components/chart-renderer";
import type { Worksheet } from "@/lib/worksheet/types";
import type { GeneratedChartConfig } from "@/ai/flows/chart-generation";

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crossFilter, setCrossFilter] = useState<{ column: string; value: string } | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [worksheetSearch, setWorksheetSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, wsList] = await Promise.all([
        fetch(`/api/dashboards/${id}`).then(r => r.json()),
        worksheetClientService.getAll(),
      ]);
      setDashboard(dashRes.data || null);
      setWorksheets(wsList);
    } catch {
      toast({ title: "Failed to load dashboard", variant: "destructive" });
    }
    setLoading(false);
  }, [id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Add worksheet to dashboard ────────────────────────────────────────────

  const addWorksheetWidget = async (ws: Worksheet) => {
    if (!dashboard) return;
    try {
      // Execute the worksheet to get fresh data
      const result = await worksheetClientService.execute(ws.id);
      // Build chart config matching ChartRenderer expectations
      const cfg = ws.config;
      const dimCols = cfg.chartType === "horizontal_bar" ? cfg.rows : cfg.columns;
      const measCols = cfg.chartType === "horizontal_bar" ? cfg.columns : cfg.rows;
      const xKey = dimCols[0]?.fieldName;
      const palette = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];
      const series = measCols.filter(p => p.role === "measure").map((p, i) => ({
        dataKey: p.alias || `${p.aggregation ?? "sum"}_${p.fieldName}`,
        name: `${p.aggregation ?? "sum"}(${p.displayName})`,
        color: palette[i % palette.length],
      }));
      const chartConfig: GeneratedChartConfig = {
        title: ws.name,
        chartType: cfg.chartType as any,
        xKey: xKey ?? "",
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
        toast({ title: `Added "${ws.name}"` });
        setAddPickerOpen(false);
      } else {
        toast({ title: "Failed to add chart", description: json.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Failed to add chart", description: e?.message, variant: "destructive" });
    }
  };

  // ── Refresh widget (re-execute its source worksheet) ─────────────────────

  const refreshWidget = async (widget: DashboardWidget) => {
    if (widget.dataSourceType !== "worksheet" || !dashboard) return;
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
  };

  const refreshAll = async () => {
    if (!dashboard) return;
    setRefreshKey(k => k + 1);
    for (const w of dashboard.widgets) {
      if (w.dataSourceType === "worksheet") await refreshWidget(w);
    }
  };

  const deleteWidget = async (widgetId: string) => {
    if (!dashboard) return;
    await fetch(`/api/dashboards/${dashboard.id}/widgets?widgetId=${widgetId}`, { method: "DELETE" });
    setDashboard(prev => prev ? { ...prev, widgets: prev.widgets.filter(w => w.id !== widgetId) } : prev);
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

  const renameDashboard = async (name: string) => {
    if (!dashboard || !name.trim()) return;
    await fetch(`/api/dashboards/${dashboard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setDashboard({ ...dashboard, name: name.trim() });
  };

  // ── Cross-filter ──────────────────────────────────────────────────────────

  const handleChartClick = useCallback((column: string, value: string | number) => {
    if (!column) return;
    const sv = String(value);
    setCrossFilter(prev => prev?.column === column && prev?.value === sv ? null : { column, value: sv });
  }, []);

  const applyCrossFilter = (config: GeneratedChartConfig): GeneratedChartConfig => {
    if (!crossFilter) return config;
    if (!config.data?.some(r => crossFilter.column in r)) return config;
    const filtered = config.data.filter(r => String(r[crossFilter.column]) === crossFilter.value);
    return { ...config, data: filtered };
  };

  // ── Filter for picker ─────────────────────────────────────────────────────

  const filteredWorksheets = useMemo(
    () => worksheets.filter(w => w.name.toLowerCase().includes(worksheetSearch.toLowerCase())),
    [worksheets, worksheetSearch],
  );

  if (loading) return <div className="h-[100dvh] flex items-center justify-center"><Loader2 className="size-6 animate-spin text-accent" /></div>;
  if (!dashboard) return <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">Dashboard not found</div>;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      {/* Header */}
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
        <Badge variant="outline" className="text-[10px]">{dashboard.widgets.length} chart{dashboard.widgets.length !== 1 ? "s" : ""}</Badge>
        {crossFilter && (
          <Badge variant="outline" className="text-[10px] gap-1 text-accent border-accent/40 cursor-pointer" onClick={() => setCrossFilter(null)}>
            <FilterIcon className="size-2.5" /> {crossFilter.column} = {crossFilter.value} <X className="size-2.5" />
          </Badge>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={refreshAll}>
          <RefreshCw className="size-3.5" /> Refresh All
        </Button>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setAddPickerOpen(true)}>
          <Plus className="size-3.5" /> Add Chart
        </Button>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {dashboard.widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-muted/30 border border-border mb-4">
                <BarChart2 className="size-10 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-1">No charts on this dashboard yet</h3>
              <p className="text-sm text-muted-foreground mb-6">Add saved charts (worksheets) to compose your dashboard.</p>
              <Button onClick={() => setAddPickerOpen(true)} className="gap-1.5">
                <Plus className="size-4" /> Add Chart
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dashboard.widgets.map(widget => (
                <Card
                  key={widget.id}
                  className={`transition-colors hover:border-accent/30 ${widget.gridW === 2 ? "md:col-span-2" : ""}`}
                >
                  <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                    <div className="flex-1 min-w-0 mr-2">
                      <CardTitle className="text-sm font-semibold truncate">{widget.title}</CardTitle>
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        {widget.dataSourceType === "worksheet" && <BarChart2 className="size-2.5" />}
                        {widget.dataSourceType === "prepared_dataset" && <Layers className="size-2.5" />}
                        <span className="truncate">{widget.dataSourceName}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Badge variant="outline" className="text-[9px] font-mono mr-1">{widget.chartType}</Badge>
                      {widget.dataSourceType === "worksheet" && (
                        <Button size="icon" variant="ghost" className="size-7" title="Refresh" onClick={() => refreshWidget(widget)}>
                          <RefreshCw className="size-3" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="size-7" title={widget.gridW === 2 ? "Half width" : "Full width"} onClick={() => toggleWidth(widget)}>
                        {widget.gridW === 2 ? <Square className="size-3" /> : <ColumnsIcon className="size-3" />}
                      </Button>
                      {widget.dataSourceType === "worksheet" && (
                        <Link href={`/visualize/worksheets/${widget.dataSourceId}`}>
                          <Button size="icon" variant="ghost" className="size-7" title="Open chart"><Maximize2 className="size-3" /></Button>
                        </Link>
                      )}
                      <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" title="Remove" onClick={() => deleteWidget(widget.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ChartRenderer
                      key={`${widget.id}_${refreshKey}`}
                      config={applyCrossFilter(widget.chartConfig)}
                      height={260}
                      onDataPointClick={handleChartClick}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Add chart picker */}
      <Dialog open={addPickerOpen} onOpenChange={setAddPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Chart to Dashboard</DialogTitle>
            <DialogDescription>Pick a saved chart (worksheet) to add. Charts auto-refresh from their semantic model.</DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input value={worksheetSearch} onChange={e => setWorksheetSearch(e.target.value)} placeholder="Search charts…" className="h-8 pl-8" />
          </div>
          <ScrollArea className="max-h-[400px] mt-3">
            {filteredWorksheets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-2">
                <p className="text-sm">No charts found.</p>
                <Link href="/visualize" className="text-accent text-xs underline">Create a chart first →</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredWorksheets.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => addWorksheetWidget(ws)}
                    className="flex items-start gap-2 p-3 rounded-lg border border-border hover:border-accent text-left transition-colors"
                  >
                    <BarChart2 className="size-4 text-accent shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ws.name}</p>
                      <Badge variant="outline" className="text-[9px] mt-1 font-mono">{ws.config.chartType}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
