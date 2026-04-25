"use client";

/**
 * LAYER: Frontend — Worksheet (Chart Builder)
 * Drag-and-drop UI: fields panel → Columns/Rows/Filters/Marks shelves → live preview.
 * Tableau-style.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Save, Hash, Type as TypeIcon, Calendar, ToggleLeft,
  X, Sparkles, BarChart2, LineChart as LineIcon, PieChart as PieIcon,
  ScatterChart as ScatterIcon, Activity, Box, Filter as FilterIcon,
  Palette, Tag, AlertCircle, Play, Settings2, Hash as HashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { semanticClientService } from "@/services/semantic.service";
import { worksheetClientService } from "@/services/worksheet.service";
import { ChartRenderer } from "@/components/chart-renderer";
import type { GeneratedChartConfig } from "@/ai/flows/chart-generation";
import type { SemanticModel, FieldDef, CalcField, AggFunc, DataType } from "@/lib/semantic/types";
import type {
  Worksheet, WorksheetConfig, ShelfPill, FilterPill, ChartType,
} from "@/lib/worksheet/types";
import { defaultConfig, configToSemanticQuery } from "@/lib/worksheet/types";

// ── Chart type metadata ───────────────────────────────────────────────────────

const CHART_TYPES: { type: ChartType; label: string; icon: React.ElementType; description: string }[] = [
  { type: "bar", label: "Bar", icon: BarChart2, description: "Compare categorical values" },
  { type: "horizontal_bar", label: "Horizontal Bar", icon: BarChart2, description: "Long category labels" },
  { type: "stacked_bar", label: "Stacked Bar", icon: BarChart2, description: "Composition by category" },
  { type: "line", label: "Line", icon: LineIcon, description: "Trends over time" },
  { type: "area", label: "Area", icon: Activity, description: "Volume over time" },
  { type: "pie", label: "Pie", icon: PieIcon, description: "Part-of-whole" },
  { type: "donut", label: "Donut", icon: PieIcon, description: "Pie with hollow center" },
  { type: "scatter", label: "Scatter", icon: ScatterIcon, description: "Correlations" },
  { type: "bubble", label: "Bubble", icon: ScatterIcon, description: "Three-dimensional scatter" },
  { type: "kpi", label: "KPI", icon: HashIcon, description: "Single big number" },
  { type: "table", label: "Table", icon: BarChart2, description: "Detail view" },
];

const AGG_OPTIONS: AggFunc[] = ["sum", "avg", "count", "count_distinct", "min", "max"];

function fieldIcon(t: DataType) {
  if (t === "number") return Hash;
  if (t === "date") return Calendar;
  if (t === "boolean") return ToggleLeft;
  return TypeIcon;
}

function colorForRole(role: "dimension" | "measure") {
  return role === "measure" ? "text-blue-400" : "text-green-400";
}

function bgForRole(role: "dimension" | "measure") {
  return role === "measure" ? "bg-blue-500/15 border-blue-500/30 text-blue-200" : "bg-green-500/15 border-green-500/30 text-green-200";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorksheetEditorPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const isNew = id === "new";
  const presetModelId = search?.get("modelId") || "";

  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [allModels, setAllModels] = useState<SemanticModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);

  // ── Initialize ─────────────────────────────────────────────────────────────

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const models = await semanticClientService.getAll();
      setAllModels(models);

      if (isNew) {
        // Create new worksheet
        if (!presetModelId || !models.find(m => m.id === presetModelId)) {
          toast({ title: "Select a model first", variant: "destructive" });
          router.push("/visualize");
          return;
        }
        const ws = await worksheetClientService.create({
          name: "Untitled Chart",
          modelId: presetModelId,
          config: defaultConfig(),
        });
        setWorksheet(ws);
        const m = models.find(x => x.id === presetModelId)!;
        setModel(m);
        router.replace(`/visualize/worksheets/${ws.id}`);
      } else {
        const ws = await worksheetClientService.getById(id);
        setWorksheet(ws);
        if (ws.modelId) setModel(models.find(m => m.id === ws.modelId) || null);
      }
    } catch (e: any) {
      toast({ title: "Failed to load chart", description: e?.message, variant: "destructive" });
    }
    setLoading(false);
  }, [id, isNew, presetModelId]); // eslint-disable-line

  useEffect(() => { initialize(); }, [initialize]);

  // ── All available fields (dimensions + measures + calcs) ───────────────────

  const allFields = useMemo(() => {
    if (!model) return [] as Array<FieldDef | (CalcField & { isCalc: true })>;
    return [
      ...model.fields.filter(f => !f.hidden),
      ...model.calculations.map(c => ({ ...c, isCalc: true as const })),
    ];
  }, [model]);

  const dimensions = allFields.filter(f => f.role === "dimension");
  const measures = allFields.filter(f => f.role === "measure");

  // ── Update worksheet config ─────────────────────────────────────────────────

  const updateConfig = (updates: Partial<WorksheetConfig>) => {
    if (!worksheet) return;
    setWorksheet({ ...worksheet, config: { ...worksheet.config, ...updates } });
  };

  // ── Drag handling ──────────────────────────────────────────────────────────

  const handleDrop = (
    target: "columns" | "rows" | "filters" | "color" | "size" | "label",
    rawData: string,
  ) => {
    if (!worksheet) return;
    try {
      const f = JSON.parse(rawData) as FieldDef | CalcField;
      const pill: ShelfPill = {
        fieldName: f.name,
        displayName: f.displayName,
        role: f.role,
        dataType: f.dataType,
        aggregation: f.role === "measure" ? (f.defaultAgg ?? "sum") : undefined,
      };

      const cfg = worksheet.config;
      if (target === "columns") updateConfig({ columns: [...cfg.columns, pill] });
      else if (target === "rows") updateConfig({ rows: [...cfg.rows, pill] });
      else if (target === "filters") {
        const filterPill: FilterPill = {
          ...pill,
          filterMode: f.role === "measure" ? "range" : "in",
          values: [],
        };
        updateConfig({ filters: [...cfg.filters, filterPill] });
      }
      else if (target === "color") updateConfig({ marks: { ...cfg.marks, color: pill } });
      else if (target === "size") updateConfig({ marks: { ...cfg.marks, size: pill } });
      else if (target === "label") updateConfig({ marks: { ...cfg.marks, label: pill } });
    } catch (e) { console.error(e); }
  };

  const removePill = (target: "columns" | "rows" | "filters" | "color" | "size" | "label", index?: number) => {
    if (!worksheet) return;
    const cfg = worksheet.config;
    if (target === "columns" && index !== undefined) updateConfig({ columns: cfg.columns.filter((_, i) => i !== index) });
    else if (target === "rows" && index !== undefined) updateConfig({ rows: cfg.rows.filter((_, i) => i !== index) });
    else if (target === "filters" && index !== undefined) updateConfig({ filters: cfg.filters.filter((_, i) => i !== index) });
    else if (target === "color") updateConfig({ marks: { ...cfg.marks, color: undefined } });
    else if (target === "size") updateConfig({ marks: { ...cfg.marks, size: undefined } });
    else if (target === "label") updateConfig({ marks: { ...cfg.marks, label: undefined } });
  };

  const updatePillAt = (target: "columns" | "rows", index: number, updates: Partial<ShelfPill>) => {
    if (!worksheet) return;
    const cfg = worksheet.config;
    const list = target === "columns" ? cfg.columns : cfg.rows;
    const next = list.map((p, i) => i === index ? { ...p, ...updates } : p);
    updateConfig({ [target]: next } as any);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async (silent = false) => {
    if (!worksheet) return;
    setSaving(true);
    try {
      await worksheetClientService.update(worksheet.id, {
        name: worksheet.name,
        config: worksheet.config,
      });
      if (!silent) toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Execute query ─────────────────────────────────────────────────────────

  const execute = useCallback(async () => {
    if (!worksheet || !worksheet.modelId) return;
    if (worksheet.config.columns.length === 0 && worksheet.config.rows.length === 0) {
      setExecutionResult(null); return;
    }
    setExecuting(true);
    try {
      // Save first to ensure server uses latest config
      await worksheetClientService.update(worksheet.id, { config: worksheet.config });
      const result = await worksheetClientService.execute(worksheet.id);
      setExecutionResult(result);
    } catch (e: any) {
      setExecutionResult({ error: e?.message || "Query failed" });
    }
    setExecuting(false);
  }, [worksheet?.id, worksheet?.config]); // eslint-disable-line

  // Auto-execute when shelves change (debounced)
  useEffect(() => {
    if (!worksheet) return;
    const timer = setTimeout(() => execute(), 600);
    return () => clearTimeout(timer);
  }, [JSON.stringify(worksheet?.config), execute]); // eslint-disable-line

  // ── Build chart config from execution result ──────────────────────────────

  const chartConfig = useMemo<GeneratedChartConfig | null>(() => {
    if (!worksheet || !executionResult || executionResult.error) return null;
    const cfg = worksheet.config;
    const dimCols = cfg.chartType === "horizontal_bar" ? cfg.rows : cfg.columns;
    const measCols = cfg.chartType === "horizontal_bar" ? cfg.columns : cfg.rows;
    const xKey = dimCols[0]?.fieldName;
    const palette = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];
    const series = measCols.filter(p => p.role === "measure").map((p, i) => ({
      dataKey: p.alias || `${p.aggregation ?? "sum"}_${p.fieldName}`,
      name: `${p.aggregation ?? "sum"}(${p.displayName})`,
      color: palette[i % palette.length],
    }));
    if (!xKey || !series.length) return null;

    const ct = cfg.chartType === "horizontal_bar" ? "horizontal_bar"
      : cfg.chartType === "stacked_bar" ? "stacked_bar"
      : cfg.chartType;

    return {
      title: worksheet.name,
      chartType: ct as any,
      xKey,
      series,
      data: executionResult.rows ?? [],
      sql: null,
    };
  }, [worksheet, executionResult]);

  if (loading) return <div className="h-[100dvh] flex items-center justify-center"><Loader2 className="size-6 animate-spin text-accent" /></div>;
  if (!worksheet) return <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">Worksheet not found</div>;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-2.5 flex items-center gap-3 bg-background/80 backdrop-blur shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/visualize")}>
          <ArrowLeft className="size-4" />
        </Button>
        <BarChart2 className="size-4 text-accent shrink-0" />
        <Input
          value={worksheet.name}
          onChange={e => setWorksheet({ ...worksheet, name: e.target.value })}
          className="h-7 text-base font-semibold border-0 px-1 max-w-md focus-visible:ring-1"
        />
        {model ? (
          <Badge variant="outline" className="text-[10px] gap-1 ml-2"><Box className="size-2.5" /> {model.name}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-400/30 gap-1 ml-2">
            <AlertCircle className="size-2.5" /> No model bound
          </Badge>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={execute} disabled={executing || !model}>
          {executing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run
        </Button>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => save()} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left: Fields panel */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col bg-sidebar/50">
          <div className="p-3 border-b border-border shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data Fields</p>
            {!model ? (
              <p className="text-xs text-muted-foreground mt-2">No model bound to this chart.</p>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{model.name}</p>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-3">
              <FieldGroup title="Dimensions" fields={dimensions} />
              <FieldGroup title="Measures" fields={measures} />
            </div>
          </ScrollArea>
        </div>

        {/* Center: Shelves + Chart */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Shelves */}
          <div className="border-b border-border bg-muted/20 shrink-0 px-3 py-2 space-y-1.5">
            <Shelf
              label="Columns"
              hint="X-axis dimensions (drop fields here)"
              pills={worksheet.config.columns}
              onDrop={data => handleDrop("columns", data)}
              onRemove={i => removePill("columns", i)}
              onUpdate={(i, u) => updatePillAt("columns", i, u)}
            />
            <Shelf
              label="Rows"
              hint="Y-axis measures (drop fields here)"
              pills={worksheet.config.rows}
              onDrop={data => handleDrop("rows", data)}
              onRemove={i => removePill("rows", i)}
              onUpdate={(i, u) => updatePillAt("rows", i, u)}
            />
            <Shelf
              label="Filters"
              hint="Restrict data (drop fields here)"
              pills={worksheet.config.filters}
              onDrop={data => handleDrop("filters", data)}
              onRemove={i => removePill("filters", i)}
              onUpdate={() => {}}
              isFilter
            />
          </div>

          {/* Chart preview */}
          <div className="flex-1 overflow-hidden p-4 bg-background">
            {!model ? (
              <PreviewMessage icon={Box} title="Bind a semantic model to start building" />
            ) : worksheet.config.columns.length === 0 && worksheet.config.rows.length === 0 ? (
              <PreviewMessage icon={Sparkles} title="Drag fields onto Columns and Rows to build your chart" />
            ) : executing ? (
              <PreviewMessage icon={Loader2} title="Running query…" spin />
            ) : executionResult?.error ? (
              <PreviewMessage icon={AlertCircle} title="Query failed" subtitle={executionResult.error} error />
            ) : chartConfig ? (
              <div className="rounded-xl border border-border bg-card h-full p-4 overflow-auto">
                <ChartRenderer config={chartConfig} height={500} />
                {executionResult && (
                  <p className="text-[10px] text-muted-foreground mt-3 text-center">
                    {executionResult.rowCount?.toLocaleString()} rows · {executionResult.executionMs}ms
                  </p>
                )}
              </div>
            ) : (
              <PreviewMessage icon={Sparkles} title="Add at least one dimension and one measure" />
            )}
          </div>
        </div>

        {/* Right: Chart type + Marks card */}
        <div className="w-64 shrink-0 border-l border-border flex flex-col bg-sidebar/50">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {/* Chart type picker */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Chart Type</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CHART_TYPES.map(ct => {
                    const Icon = ct.icon;
                    const active = worksheet.config.chartType === ct.type;
                    return (
                      <Tooltip key={ct.type}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => updateConfig({ chartType: ct.type })}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                              active ? "border-accent bg-accent/15 text-accent" : "border-border hover:border-accent/50 text-muted-foreground"
                            }`}
                          >
                            <Icon className="size-4" />
                            <span className="text-[9px] font-medium">{ct.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">{ct.description}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>

              {/* Marks card */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Marks</p>
                <div className="space-y-1.5">
                  <MarkSlot
                    label="Color"
                    icon={Palette}
                    pill={worksheet.config.marks.color}
                    onDrop={d => handleDrop("color", d)}
                    onRemove={() => removePill("color")}
                  />
                  <MarkSlot
                    label="Size"
                    icon={Settings2}
                    pill={worksheet.config.marks.size}
                    onDrop={d => handleDrop("size", d)}
                    onRemove={() => removePill("size")}
                  />
                  <MarkSlot
                    label="Label"
                    icon={Tag}
                    pill={worksheet.config.marks.label}
                    onDrop={d => handleDrop("label", d)}
                    onRemove={() => removePill("label")}
                  />
                </div>
              </div>

              {/* Options */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Options</p>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={worksheet.config.options.showLegend ?? true}
                      onChange={e => updateConfig({ options: { ...worksheet.config.options, showLegend: e.target.checked } })}
                    />
                    Show legend
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={worksheet.config.options.showLabels ?? false}
                      onChange={e => updateConfig({ options: { ...worksheet.config.options, showLabels: e.target.checked } })}
                    />
                    Show labels
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={worksheet.config.options.stacked ?? false}
                      onChange={e => updateConfig({ options: { ...worksheet.config.options, stacked: e.target.checked } })}
                    />
                    Stacked
                  </label>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ── Field Group (draggable) ──────────────────────────────────────────────────

function FieldGroup({ title, fields }: { title: string; fields: any[] }) {
  if (fields.length === 0) {
    return (
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1 mb-1">{title}</p>
        <p className="text-[10px] text-muted-foreground italic px-1">None</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1 mb-1">{title}</p>
      <div className="space-y-0.5">
        {fields.map(f => {
          const Icon = fieldIcon(f.dataType);
          const cls = colorForRole(f.role);
          return (
            <div
              key={f.name}
              draggable
              onDragStart={e => e.dataTransfer.setData("text/plain", JSON.stringify(f))}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-accent/10 cursor-grab active:cursor-grabbing text-xs group"
              title={`${f.displayName} (${f.dataType})${f.isCalc ? " — calculated" : ""}`}
            >
              <Icon className={`size-3 ${cls}`} />
              <span className="flex-1 truncate">{f.displayName}</span>
              {f.isCalc && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">fx</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shelf (drop target) ──────────────────────────────────────────────────────

function Shelf({
  label, hint, pills, onDrop, onRemove, onUpdate, isFilter,
}: {
  label: string;
  hint: string;
  pills: ShelfPill[] | FilterPill[];
  onDrop: (data: string) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updates: Partial<ShelfPill>) => void;
  isFilter?: boolean;
}) {
  const [over, setOver] = useState(false);

  return (
    <div className="flex items-start gap-2">
      <div className="w-16 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">{label}</div>
      <div
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain")); }}
        className={`flex-1 min-h-[34px] rounded-lg border-2 border-dashed flex flex-wrap gap-1.5 p-1.5 transition-colors ${
          over ? "border-accent bg-accent/10" : "border-border bg-muted/20"
        }`}
      >
        {pills.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic px-1.5 py-1">{hint}</p>
        )}
        {pills.map((p, i) => (
          <Pill
            key={`${p.fieldName}_${i}`}
            pill={p as ShelfPill}
            isFilter={isFilter}
            onRemove={() => onRemove(i)}
            onUpdate={u => onUpdate(i, u)}
          />
        ))}
      </div>
    </div>
  );
}

function Pill({
  pill, isFilter, onRemove, onUpdate,
}: {
  pill: ShelfPill;
  isFilter?: boolean;
  onRemove: () => void;
  onUpdate: (u: Partial<ShelfPill>) => void;
}) {
  const Icon = fieldIcon(pill.dataType);
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${bgForRole(pill.role)}`}>
      <Icon className="size-2.5" />
      {pill.role === "measure" && !isFilter && (
        <Select value={pill.aggregation ?? "sum"} onValueChange={v => onUpdate({ aggregation: v as AggFunc })}>
          <SelectTrigger className="h-4 w-auto px-1 py-0 text-[10px] border-0 bg-transparent focus:ring-0 gap-0.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGG_OPTIONS.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {pill.role === "measure" && !isFilter && <span>(</span>}
      <span>{pill.displayName}</span>
      {pill.role === "measure" && !isFilter && <span>)</span>}
      <button onClick={onRemove} className="ml-1 hover:text-destructive">
        <X className="size-2.5" />
      </button>
    </div>
  );
}

// ── Mark Slot (drop target for color/size/label) ─────────────────────────────

function MarkSlot({
  label, icon: Icon, pill, onDrop, onRemove,
}: {
  label: string;
  icon: React.ElementType;
  pill?: ShelfPill;
  onDrop: (data: string) => void;
  onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain")); }}
      className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
        over ? "border-accent bg-accent/10" : "border-border bg-card"
      }`}
    >
      <Icon className="size-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] font-medium w-10 shrink-0">{label}</span>
      {pill ? (
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border ${bgForRole(pill.role)} flex-1 min-w-0`}>
          <span className="truncate">{pill.displayName}</span>
          <button onClick={onRemove}><X className="size-2.5" /></button>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">drop here</span>
      )}
    </div>
  );
}

function PreviewMessage({
  icon: Icon, title, subtitle, error, spin,
}: {
  icon: React.ElementType; title: string; subtitle?: string; error?: boolean; spin?: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className={`p-4 rounded-2xl ${error ? "bg-destructive/10 border-destructive/30" : "bg-muted/30 border-border"} border mb-3`}>
        <Icon className={`size-10 ${error ? "text-destructive" : "text-muted-foreground"} ${spin ? "animate-spin" : ""}`} />
      </div>
      <p className={`text-sm font-semibold ${error ? "text-destructive" : ""}`}>{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 max-w-md">{subtitle}</p>}
    </div>
  );
}
