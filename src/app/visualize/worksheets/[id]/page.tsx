"use client";

/**
 * LAYER: Frontend — Worksheet (Chart Builder)
 * Drag-and-drop UI: fields panel → Columns/Rows/Filters/Marks shelves → live preview.
 * Tableau-style.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Save, Hash, Type as TypeIcon, Calendar, ToggleLeft,
  X, Sparkles, BarChart2, LineChart as LineIcon, PieChart as PieIcon,
  ScatterChart as ScatterIcon, Activity, Box, Filter as FilterIcon,
  Palette, Tag, AlertCircle, Play, Settings2, Hash as HashIcon,
  Search, Table2, TrendingDown, Gauge as GaugeIcon, GitBranch,
  Layers, Triangle, Radio,
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

const CHART_TYPES: { type: ChartType; label: string; icon: React.ElementType; description: string; group: string }[] = [
  { type: "bar",           label: "Bar",          icon: BarChart2,    description: "Compare categorical values",      group: "Basic" },
  { type: "horizontal_bar",label: "H. Bar",        icon: BarChart2,    description: "Long category labels",            group: "Basic" },
  { type: "stacked_bar",   label: "Stacked",      icon: BarChart2,    description: "Composition by category",         group: "Basic" },
  { type: "line",          label: "Line",         icon: LineIcon,     description: "Trends over time",                group: "Basic" },
  { type: "area",          label: "Area",         icon: Activity,     description: "Volume over time",                group: "Basic" },
  { type: "pie",           label: "Pie",          icon: PieIcon,      description: "Part-of-whole",                   group: "Basic" },
  { type: "donut",         label: "Donut",        icon: PieIcon,      description: "Pie with hollow center",          group: "Basic" },
  { type: "scatter",       label: "Scatter",      icon: ScatterIcon,  description: "Correlations between measures",   group: "Advanced" },
  { type: "bubble",        label: "Bubble",       icon: ScatterIcon,  description: "Three-dimensional scatter",       group: "Advanced" },
  { type: "radar",         label: "Radar",        icon: Radio,        description: "Multi-axis comparisons",          group: "Advanced" },
  { type: "heatmap",       label: "Heatmap",      icon: Layers,       description: "Density across two dimensions",   group: "Advanced" },
  { type: "treemap",       label: "Treemap",      icon: Layers,       description: "Hierarchical proportions",        group: "Advanced" },
  { type: "waterfall",     label: "Waterfall",    icon: TrendingDown, description: "Cumulative effect of values",     group: "Advanced" },
  { type: "funnel",        label: "Funnel",       icon: Triangle,     description: "Stage-by-stage conversion",       group: "Advanced" },
  { type: "gauge",         label: "Gauge",        icon: GaugeIcon,    description: "Single value vs. target",         group: "Other" },
  { type: "radial_bar",    label: "Radial Bar",   icon: Radio,        description: "Circular bar comparison",         group: "Other" },
  { type: "histogram",     label: "Histogram",    icon: BarChart2,    description: "Distribution of a numeric field", group: "Other" },
  { type: "composed",      label: "Combined",     icon: GitBranch,    description: "Bar + line on the same axes",     group: "Other" },
  { type: "sankey",        label: "Sankey",       icon: GitBranch,    description: "Flow between categories",         group: "Other" },
  { type: "kpi",           label: "KPI",          icon: HashIcon,     description: "Single big number",               group: "Other" },
  { type: "table",         label: "Table",        icon: Table2,       description: "Detail view",                     group: "Other" },
];

const CHART_GROUPS = ["Basic", "Advanced", "Other"];

const AGG_OPTIONS: AggFunc[] = ["sum", "avg", "count", "count_distinct", "min", "max"];
const PALETTE = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];

function fieldIcon(t: DataType) {
  if (t === "number") return Hash;
  if (t === "date") return Calendar;
  if (t === "boolean") return ToggleLeft;
  return TypeIcon;
}

function bgForRole(role: "dimension" | "measure") {
  return role === "measure"
    ? "bg-blue-500/15 border-blue-500/30 text-blue-200"
    : "bg-green-500/15 border-green-500/30 text-green-200";
}

// ── Chart types that need only measures (no xKey required) ────────────────────
const MEASURE_ONLY_CHARTS: ChartType[] = ["kpi", "gauge", "histogram", "radial_bar"];

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
  const [fieldSearch, setFieldSearch] = useState("");

  // Keep a stable ref to the latest worksheet so execute() never captures stale state
  const worksheetRef = useRef<Worksheet | null>(null);
  worksheetRef.current = worksheet;

  // Concurrency guards — prevent duplicate in-flight executes
  const executingRef    = useRef(false);  // true while a fetch is in flight
  const pendingExecRef  = useRef(false);  // config changed while in-flight → re-run after
  // Track the last config we actually sent to the server to skip redundant PATCHes
  const savedConfigRef  = useRef<string | null>(null);

  // ── Initialize ─────────────────────────────────────────────────────────────

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const models = await semanticClientService.getAll();
      setAllModels(models);

      if (isNew) {
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
        setModel(models.find(x => x.id === presetModelId) ?? null);
        router.replace(`/visualize/worksheets/${ws.id}`);
      } else {
        const ws = await worksheetClientService.getById(id);
        setWorksheet(ws);
        if (ws.modelId) setModel(models.find(m => m.id === ws.modelId) ?? null);
      }
    } catch (e: any) {
      toast({ title: "Failed to load chart", description: e?.message, variant: "destructive" });
    }
    setLoading(false);
  }, [id, isNew, presetModelId]); // eslint-disable-line

  useEffect(() => { initialize(); }, [initialize]);

  // ── Fields (filtered by search) ────────────────────────────────────────────

  const allFields = useMemo(() => {
    if (!model) return [] as Array<FieldDef | (CalcField & { isCalc: true })>;
    return [
      ...model.fields.filter(f => !f.hidden),
      ...model.calculations.map(c => ({ ...c, isCalc: true as const })),
    ];
  }, [model]);

  const filteredFields = useMemo(() => {
    const q = fieldSearch.toLowerCase();
    return allFields.filter(f => !q || f.displayName.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  }, [allFields, fieldSearch]);

  const dimensions = filteredFields.filter(f => f.role === "dimension");
  const measures = filteredFields.filter(f => f.role === "measure");

  // ── Config mutations ────────────────────────────────────────────────────────

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
        const fp: FilterPill = {
          ...pill,
          filterMode: f.role === "measure" ? "range" : "in",
          values: [],
        };
        updateConfig({ filters: [...cfg.filters, fp] });
      } else if (target === "color") updateConfig({ marks: { ...cfg.marks, color: pill } });
      else if (target === "size")  updateConfig({ marks: { ...cfg.marks, size: pill } });
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
    else if (target === "size")  updateConfig({ marks: { ...cfg.marks, size: undefined } });
    else if (target === "label") updateConfig({ marks: { ...cfg.marks, label: undefined } });
  };

  const updatePillAt = (target: "columns" | "rows", index: number, updates: Partial<ShelfPill>) => {
    if (!worksheet) return;
    const cfg = worksheet.config;
    const list = target === "columns" ? cfg.columns : cfg.rows;
    updateConfig({ [target]: list.map((p, i) => i === index ? { ...p, ...updates } : p) } as any);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async (silent = false) => {
    if (!worksheet) return;
    setSaving(true);
    try {
      await worksheetClientService.update(worksheet.id, { name: worksheet.name, config: worksheet.config });
      if (!silent) toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Execute query ─────────────────────────────────────────────────────────
  // • Reads state via refs — never captures stale closures.
  // • Mutex: if already in-flight, marks a pending re-run instead of stacking.
  // • Skips the PATCH when the config hasn't changed since the last save.

  const execute = useCallback(async () => {
    if (executingRef.current) {
      pendingExecRef.current = true; // re-run once current finishes
      return;
    }

    const ws = worksheetRef.current;
    if (!ws?.modelId) return;
    const cfg = ws.config;
    const hasFields = cfg.columns.length > 0 || cfg.rows.length > 0;
    if (!hasFields) { setExecutionResult(null); return; }

    executingRef.current   = true;
    pendingExecRef.current = false;
    setExecuting(true);

    try {
      // Only PATCH when the config has actually changed since the last save.
      const cfgJson = JSON.stringify(cfg);
      if (savedConfigRef.current !== cfgJson) {
        await worksheetClientService.update(ws.id, { config: cfg });
        savedConfigRef.current = cfgJson;
      }
      const result = await worksheetClientService.execute(ws.id);
      setExecutionResult(result);
    } catch (e: any) {
      setExecutionResult({ error: e?.message || "Query failed" });
    }

    setExecuting(false);
    executingRef.current = false;

    // If config changed while we were running, fire one more execute.
    if (pendingExecRef.current) {
      pendingExecRef.current = false;
      execute();
    }
  }, []); // stable — all state accessed via refs

  // Debounced auto-execute when shelves change
  useEffect(() => {
    if (!worksheet) return;
    const hasFields = worksheet.config.columns.length > 0 || worksheet.config.rows.length > 0;
    if (!hasFields) { setExecutionResult(null); return; }
    const timer = setTimeout(execute, 600);
    return () => clearTimeout(timer);
  }, [JSON.stringify(worksheet?.config)]); // eslint-disable-line

  // ── Build chart config from execution result ──────────────────────────────

  const chartConfig = useMemo<GeneratedChartConfig | null>(() => {
    if (!worksheet || !executionResult || executionResult.error) return null;
    const cfg = worksheet.config;
    const rows = executionResult.rows ?? [];

    // KPI / gauge / histogram / radial_bar — only need measures, no xKey
    if (MEASURE_ONLY_CHARTS.includes(cfg.chartType)) {
      const allPills = [...cfg.columns, ...cfg.rows];
      const mPill = allPills.find(p => p.role === "measure");
      if (!mPill) return null;
      const dk = mPill.alias || `${mPill.aggregation ?? "sum"}_${mPill.fieldName}`;
      return {
        title: worksheet.name,
        chartType: cfg.chartType as any,
        xKey: dk,
        series: [{ dataKey: dk, name: `${mPill.aggregation ?? "sum"}(${mPill.displayName})`, color: PALETTE[0] }],
        data: rows,
        sql: null,
      };
    }

    // Table — any fields work
    if (cfg.chartType === "table") {
      const allPills = [...cfg.columns, ...cfg.rows];
      if (!allPills.length) return null;
      const resultCols = executionResult.columns ?? [];
      if (!resultCols.length) return null;
      const [first, ...rest] = resultCols;
      return {
        title: worksheet.name,
        chartType: "table",
        xKey: first.name,
        series: rest.map((c: any, i: number) => ({ dataKey: c.name, name: c.name, color: PALETTE[i % PALETTE.length] })),
        data: rows,
        sql: null,
      };
    }

    // Sankey — needs xKey + targetKey + one measure
    if (cfg.chartType === "sankey") {
      const dimPills = cfg.columns.filter(p => p.role === "dimension");
      const mPill = cfg.rows.find(p => p.role === "measure");
      if (dimPills.length < 2 || !mPill) return null;
      const dk = mPill.alias || `${mPill.aggregation ?? "sum"}_${mPill.fieldName}`;
      return {
        title: worksheet.name,
        chartType: "sankey",
        xKey: dimPills[0].fieldName,
        targetKey: dimPills[1].fieldName,
        series: [{ dataKey: dk, name: `${mPill.aggregation ?? "sum"}(${mPill.displayName})`, color: PALETTE[0] }],
        data: rows,
        sql: null,
      };
    }

    // Standard charts — dimension in columns (x), measures in rows (y)
    const isHoriz = cfg.chartType === "horizontal_bar";
    const dimCols = isHoriz ? cfg.rows : cfg.columns;
    const measCols = isHoriz ? cfg.columns : cfg.rows;

    const xKey = dimCols[0]?.fieldName;
    const series = measCols
      .filter(p => p.role === "measure")
      .map((p, i) => ({
        dataKey: p.alias || `${p.aggregation ?? "sum"}_${p.fieldName}`,
        name: `${p.aggregation ?? "sum"}(${p.displayName})`,
        color: PALETTE[i % PALETTE.length],
      }));

    // Scatter / bubble can use measures on both axes — xKey may be a measure field
    if ((cfg.chartType === "scatter" || cfg.chartType === "bubble") && series.length >= 2) {
      return {
        title: worksheet.name,
        chartType: cfg.chartType as any,
        xKey: series[0]?.dataKey ?? xKey ?? "",
        series,
        data: rows,
        sql: null,
        showLabels: cfg.options.showLabels,
      };
    }

    if (!xKey || !series.length) return null;

    return {
      title: worksheet.name,
      chartType: cfg.chartType as any,
      xKey,
      series,
      data: rows,
      sql: null,
      showLabels: cfg.options.showLabels,
    };
  }, [worksheet, executionResult]);

  // ── Hint for the empty preview ─────────────────────────────────────────────

  const previewHint = useMemo(() => {
    if (!worksheet || !executionResult || executionResult.error || !model) return null;
    const cfg = worksheet.config;
    if (MEASURE_ONLY_CHARTS.includes(cfg.chartType)) {
      const hasMeasure = [...cfg.columns, ...cfg.rows].some(p => p.role === "measure");
      if (!hasMeasure) return "This chart type needs at least one measure (blue field) on any shelf.";
    } else if (cfg.chartType === "table") {
      if (!cfg.columns.length && !cfg.rows.length) return "Add any fields to Columns or Rows.";
    } else if (cfg.chartType === "sankey") {
      if (cfg.columns.filter(p => p.role === "dimension").length < 2)
        return "Sankey needs 2 dimensions in Columns (source + target) and 1 measure in Rows.";
    } else {
      const isHoriz = cfg.chartType === "horizontal_bar";
      const dimSrc = isHoriz ? cfg.rows : cfg.columns;
      const measSrc = isHoriz ? cfg.columns : cfg.rows;
      const hasDim = dimSrc.some(p => p.role === "dimension");
      const hasMeas = measSrc.some(p => p.role === "measure");
      if (!hasDim && !hasMeas) return "Drag a dimension (green) to Columns and a measure (blue) to Rows.";
      if (!hasDim) return `Add a dimension (green field) to ${isHoriz ? "Rows" : "Columns"}.`;
      if (!hasMeas) return `Add a measure (blue field) to ${isHoriz ? "Columns" : "Rows"}.`;
    }
    return null;
  }, [worksheet, executionResult, model]);

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
          <div className="p-3 border-b border-border shrink-0 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data Fields</p>
            {!model ? (
              <p className="text-xs text-muted-foreground">No model bound.</p>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground truncate">{model.name}</p>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                  <Input
                    value={fieldSearch}
                    onChange={e => setFieldSearch(e.target.value)}
                    placeholder="Search fields…"
                    className="h-6 pl-6 text-[11px] pr-2"
                  />
                  {fieldSearch && (
                    <button
                      onClick={() => setFieldSearch("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-3">
              <FieldGroup title="Dimensions" fields={dimensions} color="text-green-400" emptyLabel={fieldSearch ? "No matches" : "None"} />
              <FieldGroup title="Measures"   fields={measures}   color="text-blue-400"  emptyLabel={fieldSearch ? "No matches" : "None"} />
            </div>
          </ScrollArea>
        </div>

        {/* Center: Shelves + Chart */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Shelves */}
          <div className="border-b border-border bg-muted/20 shrink-0 px-3 py-2 space-y-1.5">
            <Shelf
              label="Columns"
              hint="X-axis — drop dimension (green) fields here"
              pills={worksheet.config.columns}
              onDrop={d => handleDrop("columns", d)}
              onRemove={i => removePill("columns", i)}
              onUpdate={(i, u) => updatePillAt("columns", i, u)}
            />
            <Shelf
              label="Rows"
              hint="Y-axis — drop measure (blue) fields here"
              pills={worksheet.config.rows}
              onDrop={d => handleDrop("rows", d)}
              onRemove={i => removePill("rows", i)}
              onUpdate={(i, u) => updatePillAt("rows", i, u)}
            />
            <Shelf
              label="Filters"
              hint="Restrict data — drop any field here"
              pills={worksheet.config.filters}
              onDrop={d => handleDrop("filters", d)}
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
                    {executionResult.truncated && " · results capped"}
                  </p>
                )}
              </div>
            ) : previewHint ? (
              <PreviewMessage icon={FilterIcon} title={previewHint} />
            ) : (
              <PreviewMessage icon={Sparkles} title="Add a dimension to Columns and a measure to Rows" />
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
                {CHART_GROUPS.map(group => (
                  <div key={group} className="mb-3">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-0.5 mb-1">{group}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {CHART_TYPES.filter(ct => ct.group === group).map(ct => {
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
                                <Icon className="size-3.5" />
                                <span className="text-[9px] font-medium leading-none">{ct.label}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">{ct.description}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Marks card */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Marks</p>
                <div className="space-y-1.5">
                  <MarkSlot label="Color" icon={Palette}   pill={worksheet.config.marks.color} onDrop={d => handleDrop("color", d)} onRemove={() => removePill("color")} />
                  <MarkSlot label="Size"  icon={Settings2} pill={worksheet.config.marks.size}  onDrop={d => handleDrop("size", d)}  onRemove={() => removePill("size")}  />
                  <MarkSlot label="Label" icon={Tag}       pill={worksheet.config.marks.label} onDrop={d => handleDrop("label", d)} onRemove={() => removePill("label")} />
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
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground whitespace-nowrap">Row limit</label>
                    <Input
                      type="number"
                      min={10}
                      max={50000}
                      value={worksheet.config.options.rowLimit ?? 1000}
                      onChange={e => updateConfig({ options: { ...worksheet.config.options, rowLimit: Number(e.target.value) || 1000 } })}
                      className="h-6 text-[11px] px-2 w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ── Field Group ────────────────────────────────────────────────────────────────

function FieldGroup({
  title, fields, color, emptyLabel,
}: {
  title: string;
  fields: any[];
  color: string;
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1 mb-1">{title}</p>
      {fields.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic px-1">{emptyLabel}</p>
      ) : (
        <div className="space-y-0.5">
          {fields.map(f => {
            const Icon = fieldIcon(f.dataType);
            return (
              <div
                key={f.name}
                draggable
                onDragStart={e => e.dataTransfer.setData("text/plain", JSON.stringify(f))}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-accent/10 cursor-grab active:cursor-grabbing text-xs group"
                title={`${f.displayName} (${f.dataType})${f.isCalc ? " — calculated" : ""}`}
              >
                <Icon className={`size-3 ${color} shrink-0`} />
                <span className="flex-1 truncate">{f.displayName}</span>
                {f.isCalc && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">fx</Badge>}
              </div>
            );
          })}
        </div>
      )}
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
  onRemove: (i: number) => void;
  onUpdate: (i: number, updates: Partial<ShelfPill>) => void;
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
      <Icon className="size-2.5 shrink-0" />
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

// ── Mark Slot ─────────────────────────────────────────────────────────────────

function MarkSlot({
  label, icon: Icon, pill, onDrop, onRemove,
}: {
  label: string; icon: React.ElementType; pill?: ShelfPill; onDrop: (d: string) => void; onRemove: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain")); }}
      className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${over ? "border-accent bg-accent/10" : "border-border bg-card"}`}
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

// ── Preview message ───────────────────────────────────────────────────────────

function PreviewMessage({
  icon: Icon, title, subtitle, error, spin,
}: {
  icon: React.ElementType; title: string; subtitle?: string; error?: boolean; spin?: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className={`p-4 rounded-2xl border mb-3 ${error ? "bg-destructive/10 border-destructive/30" : "bg-muted/30 border-border"}`}>
        <Icon className={`size-10 ${error ? "text-destructive" : "text-muted-foreground"} ${spin ? "animate-spin" : ""}`} />
      </div>
      <p className={`text-sm font-semibold ${error ? "text-destructive" : ""}`}>{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 max-w-md">{subtitle}</p>}
    </div>
  );
}
