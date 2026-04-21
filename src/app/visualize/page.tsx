"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart2, Plus, Trash2, Loader2, Database, FolderOpen,
  ChevronRight, Sparkles, RefreshCw, LayoutDashboard, PencilLine,
  Check, X, Table, FileText, Maximize2, Pencil,
  Filter, Columns, Square, Sliders, GitMerge,
  Settings2, Hash, Type, Link2,
  PanelRightClose, PanelRightOpen, Layers, ArrowRight,
  Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useDoc } from "@/hooks/use-doc";
import { ChartRenderer } from "@/components/chart-renderer";
import { ManualChartBuilder } from "@/components/manual-chart-builder";
import { generateChart, type GeneratedChartConfig, type ChartFilter } from "@/ai/flows/chart-generation";
import type { DatabaseConnection, SystemSettings } from "@/lib/store";
import { DEFAULT_SETTINGS } from "@/lib/store";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dashboard {
  id: string;
  name: string;
  widgetCount: number;
  createdAt: number;
  updatedAt: number;
}

interface DashboardWidget {
  id: string;
  dashboardId: string;
  title: string;
  chartType: string;
  chartConfig: GeneratedChartConfig;
  dataSourceType: "database" | "file";
  dataSourceId: string;
  dataSourceName: string;
  dataQuery: string | null;
  prompt: string;
  gridW: number;
  createdAt: number;
}

interface DashboardDetail extends Dashboard {
  widgets: DashboardWidget[];
}

interface SchemaColumn {
  name: string;
  type: string;
}

interface JoinConfig {
  table2: string;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL OUTER";
  leftCol: string;
  rightCol: string;
}

interface FieldMapping {
  originalName: string;
  displayName: string;
  fieldType: "dimension" | "measure";
  hidden: boolean;
}

// ── Wizard steps ──────────────────────────────────────────────────────────────

const STEPS = ["Data Source", "Select Data", "Configure Chart", "Preview & Save"];

// ── Workflow guidance steps (BI-style) ────────────────────────────────────────

const WORKFLOW = [
  { label: "Select Data", icon: Database },
  { label: "Prepare Fields", icon: Layers },
  { label: "Create Visuals", icon: BarChart2 },
  { label: "Apply Filters", icon: Filter },
  { label: "Customize", icon: Settings2 },
];

// ── File parser (CSV / TSV / JSON) ────────────────────────────────────────────

function parseFile(
  content: string,
  fileName: string
): { columns: SchemaColumn[]; rows: any[] } {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "json") {
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed.data && Array.isArray(parsed.data)
        ? parsed.data
        : [];
      if (arr.length === 0) return { columns: [], rows: [] };
      const rows = arr.slice(0, 200);
      const keys: string[] = Array.from(
        new Set(rows.flatMap((r: any) => Object.keys(r || {})))
      );
      const columns: SchemaColumn[] = keys.map((k: string) => ({
        name: k,
        type: typeof rows[0][k] === "number" ? "number" : "text",
      }));
      return { columns, rows };
    } catch {
      return { columns: [], rows: [] };
    }
  }
  const delimiter = ext === "tsv" ? "\t" : ",";
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };
  const headers = lines[0]
    .split(delimiter)
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1, 201).map((line) => {
    const vals = line.split(delimiter);
    const obj: any = {};
    headers.forEach((h, i) => {
      const raw = (vals[i] ?? "").trim().replace(/^"|"$/g, "");
      obj[h] = isNaN(Number(raw)) || raw === "" ? raw : Number(raw);
    });
    return obj;
  });
  const columns: SchemaColumn[] = headers.map((h) => ({
    name: h,
    type: rows.length > 0 && typeof rows[0][h] === "number" ? "number" : "text",
  }));
  return { columns, rows };
}

// ── Build JOIN SQL ─────────────────────────────────────────────────────────────

function buildJoinSQL(
  table1: string,
  table2Cols: SchemaColumn[],
  cfg: JoinConfig
): string {
  const t2Select = table2Cols
    .map((c) => `t2."${c.name}" AS "t2_${c.name}"`)
    .join(", ");
  return `SELECT t1.*, ${t2Select} FROM "${table1}" t1 ${cfg.joinType} JOIN "${cfg.table2}" t2 ON t1."${cfg.leftCol}" = t2."${cfg.rightCol}"`;
}

// ── Field type icon ────────────────────────────────────────────────────────────

function FieldIcon({ type }: { type: string }) {
  const isNum =
    type === "number" ||
    type === "integer" ||
    type === "float" ||
    type === "decimal" ||
    type === "numeric" ||
    type === "bigint";
  return isNum ? (
    <Hash className="size-3 text-blue-400 shrink-0" />
  ) : (
    <Type className="size-3 text-green-400 shrink-0" />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VisualizePage() {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: settingsData } = useDoc<SystemSettings>(null);
  const visualizeModel = (settingsData || DEFAULT_SETTINGS).modelMapping.visualize;

  // ── Dashboard state ───────────────────────────────────────────────────────
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [selected, setSelected] = useState<DashboardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [creatingDash, setCreatingDash] = useState(false);
  const [showNewDash, setShowNewDash] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState<"database" | "file">("database");
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [selectedConn, setSelectedConn] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableSchema, setTableSchema] = useState<{
    columns: SchemaColumn[];
    sampleRows: any[];
  }>({ columns: [], sampleRows: [] });
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [folderFilesLoading, setFolderFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [fileSchema, setFileSchema] = useState<{
    columns: SchemaColumn[];
    rows: any[];
  } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [buildMode, setBuildMode] = useState<"ai" | "manual">("manual");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<GeneratedChartConfig | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Widget actions ────────────────────────────────────────────────────────
  const [renamingWidgetId, setRenamingWidgetId] = useState<string | null>(null);
  const [renameWidgetValue, setRenameWidgetValue] = useState("");
  const [expandedWidget, setExpandedWidget] = useState<DashboardWidget | null>(null);

  // ── Edit chart dialog ─────────────────────────────────────────────────────
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [editBuildMode, setEditBuildMode] = useState<"ai" | "manual">("manual");
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editPreview, setEditPreview] = useState<GeneratedChartConfig | null>(null);
  const [editSchema, setEditSchema] = useState<{
    columns: SchemaColumn[];
    rows: any[];
  }>({ columns: [], rows: [] });
  const [editSchemaLoading, setEditSchemaLoading] = useState(false);
  const [editGenerating, setEditGenerating] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // ── Global filters ────────────────────────────────────────────────────────
  const [globalFilters, setGlobalFilters] = useState<ChartFilter[]>([]);

  // ── Right panel (new BI panel) ────────────────────────────────────────────
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState("data");
  const [focusedWidget, setFocusedWidget] = useState<DashboardWidget | null>(null);

  // ── Join builder ──────────────────────────────────────────────────────────
  const [joinEnabled, setJoinEnabled] = useState(false);
  const [joinConfig, setJoinConfig] = useState<JoinConfig>({
    table2: "",
    joinType: "INNER",
    leftCol: "",
    rightCol: "",
  });
  const [joinTable2Schema, setJoinTable2Schema] = useState<SchemaColumn[]>([]);
  const [joinTable2Loading, setJoinTable2Loading] = useState(false);
  const [joinPreviewData, setJoinPreviewData] = useState<{
    columns: SchemaColumn[];
    rows: any[];
  } | null>(null);
  const [joinPreviewLoading, setJoinPreviewLoading] = useState(false);

  // ── Data preparation / field mappings ─────────────────────────────────────
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [editingFieldIdx, setEditingFieldIdx] = useState<number | null>(null);
  const [editingFieldName, setEditingFieldName] = useState("");

  // ── Sample data preview in right panel ───────────────────────────────────
  const [dataPanelSchema, setDataPanelSchema] = useState<SchemaColumn[]>([]);
  const [dataPanelLoading, setDataPanelLoading] = useState(false);

  // ── Derived: all columns across widgets (for filter suggestions) ──────────
  const allWidgetColumns = useMemo(() => {
    if (!selected) return [];
    const cols = new Set<string>();
    selected.widgets.forEach((w) => {
      if (w.chartConfig?.xKey) cols.add(w.chartConfig.xKey);
      w.chartConfig?.series?.forEach((s) => {
        if (s.dataKey) cols.add(s.dataKey);
      });
      if (w.chartConfig?.data?.[0])
        Object.keys(w.chartConfig.data[0]).forEach((k) => cols.add(k));
    });
    return Array.from(cols).sort();
  }, [selected?.widgets]); // eslint-disable-line

  // ── Load dashboards ───────────────────────────────────────────────────────
  const loadDashboards = useCallback(async () => {
    if (!user) return;
    setDashLoading(true);
    try {
      const res = await fetch("/api/dashboards");
      const json = await res.json();
      setDashboards(json.data || []);
    } catch {}
    setDashLoading(false);
  }, [user?.uid]); // eslint-disable-line

  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  // ── Load dashboard detail ─────────────────────────────────────────────────
  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setFocusedWidget(null);
    try {
      const res = await fetch(`/api/dashboards/${id}`);
      const json = await res.json();
      setSelected(json.data || null);
    } catch {}
    setDetailLoading(false);
  };

  // ── Create / delete / rename dashboard ───────────────────────────────────
  const createDashboard = async () => {
    if (!newDashName.trim()) return;
    setCreatingDash(true);
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDashName.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setDashboards((prev) => [json.data, ...prev]);
        setNewDashName("");
        setShowNewDash(false);
        loadDetail(json.data.id);
      }
    } catch {}
    setCreatingDash(false);
  };

  const deleteDashboard = async (id: string) => {
    await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    setDashboards((prev) => prev.filter((d) => d.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const saveRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    await fetch(`/api/dashboards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setDashboards((prev) =>
      prev.map((d) => (d.id === id ? { ...d, name: renameValue.trim() } : d))
    );
    if (selected?.id === id)
      setSelected((prev) =>
        prev ? { ...prev, name: renameValue.trim() } : prev
      );
    setRenamingId(null);
  };

  // ── Open wizard ───────────────────────────────────────────────────────────
  const openWizard = async () => {
    try {
      const [connRes, folderRes] = await Promise.all([
        fetch("/api/store?key=nexus_databases"),
        fetch("/api/files?type=folders"),
      ]);
      const connJson = await connRes.json();
      const folderJson = await folderRes.json();
      setConnections(connJson.data || []);
      setFolders(folderJson.data || []);
    } catch {}
    setStep(0);
    setSourceType("database");
    setSelectedConn("");
    setTables([]);
    setSelectedTable("");
    setTableSchema({ columns: [], sampleRows: [] });
    setSelectedFolder("");
    setFolderFiles([]);
    setSelectedFile("");
    setFileSchema(null);
    setBuildMode("manual");
    setPrompt("");
    setPreview(null);
    setPreviewTitle("");
    setJoinEnabled(false);
    setJoinConfig({ table2: "", joinType: "INNER", leftCol: "", rightCol: "" });
    setJoinTable2Schema([]);
    setJoinPreviewData(null);
    setFieldMappings([]);
    setWizardOpen(true);
  };

  // ── Step 1 DB helpers ─────────────────────────────────────────────────────
  const loadTables = async (connId: string) => {
    setTablesLoading(true);
    setTables([]);
    setSelectedTable("");
    setTableSchema({ columns: [], sampleRows: [] });
    setJoinEnabled(false);
    try {
      const res = await fetch(`/api/dashboards/schema?connectionId=${connId}`);
      const json = await res.json();
      setTables(json.data?.tables || []);
    } catch {}
    setTablesLoading(false);
  };

  const loadTableSchema = async (table: string) => {
    if (!selectedConn) return;
    setSchemaLoading(true);
    setTableSchema({ columns: [], sampleRows: [] });
    setJoinEnabled(false);
    setJoinConfig({ table2: "", joinType: "INNER", leftCol: "", rightCol: "" });
    setJoinTable2Schema([]);
    setJoinPreviewData(null);
    try {
      const res = await fetch(
        `/api/dashboards/schema?connectionId=${selectedConn}&table=${encodeURIComponent(table)}`
      );
      const json = await res.json();
      const cols: SchemaColumn[] = json.data?.columns || [];
      const rows = json.data?.sampleRows || [];
      setTableSchema({ columns: cols, sampleRows: rows });
      setFieldMappings(
        cols.map((c) => ({
          originalName: c.name,
          displayName: c.name,
          fieldType: isNumericType(c.type) ? "measure" : "dimension",
          hidden: false,
        }))
      );
    } catch {}
    setSchemaLoading(false);
  };

  // ── Join builder helpers ───────────────────────────────────────────────────
  const loadTable2Schema = async (table: string) => {
    if (!selectedConn || !table) return;
    setJoinTable2Loading(true);
    setJoinTable2Schema([]);
    try {
      const res = await fetch(
        `/api/dashboards/schema?connectionId=${selectedConn}&table=${encodeURIComponent(table)}`
      );
      const json = await res.json();
      setJoinTable2Schema(json.data?.columns || []);
    } catch {}
    setJoinTable2Loading(false);
  };

  const previewJoin = async () => {
    if (
      !selectedConn ||
      !selectedTable ||
      !joinConfig.table2 ||
      !joinConfig.leftCol ||
      !joinConfig.rightCol
    )
      return;
    setJoinPreviewLoading(true);
    try {
      const sql =
        buildJoinSQL(selectedTable, joinTable2Schema, joinConfig) + " LIMIT 10";
      const res = await fetch("/api/dashboards/refresh-widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedConn, sql }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Join preview failed");
      if (json.data?.rows?.length > 0) {
        const cols: SchemaColumn[] = Object.keys(json.data.rows[0]).map(
          (k) => ({
            name: k,
            type:
              typeof json.data.rows[0][k] === "number" ? "number" : "text",
          })
        );
        setJoinPreviewData({ columns: cols, rows: json.data.rows });
        setTableSchema({ columns: cols, sampleRows: json.data.rows });
        setFieldMappings(
          cols.map((c) => ({
            originalName: c.name,
            displayName: c.name,
            fieldType: isNumericType(c.type) ? "measure" : "dimension",
            hidden: false,
          }))
        );
        toast({
          title: "Join applied",
          description: `${cols.length} columns available from joined dataset.`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Join preview failed",
        description: err.message,
        variant: "destructive",
      });
    }
    setJoinPreviewLoading(false);
  };

  // ── Step 1 File helpers ───────────────────────────────────────────────────
  const loadFolderFiles = async (folderId: string) => {
    setFolderFilesLoading(true);
    setFolderFiles([]);
    setSelectedFile("");
    setFileSchema(null);
    try {
      const res = await fetch(`/api/files?type=files&folderId=${folderId}`);
      const json = await res.json();
      setFolderFiles(
        (json.data || []).filter((f: any) => /\.(csv|json|tsv)$/i.test(f.name))
      );
    } catch {}
    setFolderFilesLoading(false);
  };

  const loadFile = async (fileId: string) => {
    setFileLoading(true);
    setFileSchema(null);
    try {
      const res = await fetch(`/api/files?type=content&fileId=${fileId}`);
      const json = await res.json();
      if (json.data?.content) {
        const fileName =
          folderFiles.find((f) => f.id === fileId)?.name || "";
        const parsed = parseFile(json.data.content, fileName);
        setFileSchema(parsed);
        setFieldMappings(
          parsed.columns.map((c) => ({
            originalName: c.name,
            displayName: c.name,
            fieldType: isNumericType(c.type) ? "measure" : "dimension",
            hidden: false,
          }))
        );
      }
    } catch {}
    setFileLoading(false);
  };

  // ── AI chart generation ───────────────────────────────────────────────────
  const runGenerate = async () => {
    setGenerating(true);
    setPreview(null);
    try {
      let result: GeneratedChartConfig;
      if (sourceType === "database") {
        const conn = connections.find((c) => c.id === selectedConn);
        const joinSQL = joinEnabled && joinPreviewData
          ? buildJoinSQL(selectedTable, joinTable2Schema, joinConfig)
          : undefined;
        result = await generateChart({
          sourceType: "database",
          tableName: joinSQL
            ? `(${joinSQL}) AS joined_data`
            : selectedTable,
          columns: tableSchema.columns,
          sampleRows: tableSchema.sampleRows,
          prompt,
          dbType: conn?.type,
          connectionId: selectedConn,
          userId: user?.uid,
          preferredModel: visualizeModel,
        });
      } else {
        const file = folderFiles.find((f) => f.id === selectedFile);
        result = await generateChart({
          sourceType: "file",
          tableName: file?.name || "data",
          columns: fileSchema?.columns || [],
          sampleRows: fileSchema?.rows?.slice(0, 5) || [],
          allRows: fileSchema?.rows,
          prompt,
          preferredModel: visualizeModel,
        });
      }
      setPreview(result);
      setPreviewTitle(result.title);
      setStep(3);
    } catch (err: any) {
      const msg: string = err.message || "";
      const friendly = msg.includes("429") || msg.toLowerCase().includes("quota")
        ? "AI quota exceeded. Switch model in Settings or try again later."
        : msg.includes("401") || msg.toLowerCase().includes("api key")
        ? "Invalid or missing API key. Check your model settings."
        : msg;
      toast({ title: "Generation failed", description: friendly, variant: "destructive" });
    }
    setGenerating(false);
  };

  // ── Save widget ───────────────────────────────────────────────────────────
  const saveWidget = async () => {
    if (!selected || !preview) return;
    setSaving(true);
    try {
      const conn = connections.find((c) => c.id === selectedConn);
      const file = folderFiles.find((f) => f.id === selectedFile);
      const joinSQL =
        joinEnabled && joinPreviewData
          ? buildJoinSQL(selectedTable, joinTable2Schema, joinConfig)
          : undefined;
      const res = await fetch(`/api/dashboards/${selected.id}/widgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: previewTitle,
          chartType: preview.chartType,
          chartConfig: { ...preview, title: previewTitle },
          dataSourceType: sourceType,
          dataSourceId: sourceType === "database" ? selectedConn : selectedFile,
          dataSourceName:
            sourceType === "database"
              ? joinSQL
                ? `${conn?.name} / ${selectedTable} ⋈ ${joinConfig.table2}`
                : `${conn?.name} / ${selectedTable}`
              : file?.name,
          dataQuery: joinSQL ?? preview.sql,
          prompt: buildMode === "ai" ? prompt : "",
          gridW: 1,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setSelected((prev) =>
          prev ? { ...prev, widgets: [...prev.widgets, json.data] } : prev
        );
        setDashboards((prev) =>
          prev.map((d) =>
            d.id === selected.id
              ? { ...d, widgetCount: d.widgetCount + 1 }
              : d
          )
        );
        toast({ title: "Chart added", description: `"${previewTitle}" added.` });
        setWizardOpen(false);
      } else {
        toast({ title: "Save failed", description: json.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // ── Delete widget ─────────────────────────────────────────────────────────
  const deleteWidget = async (widgetId: string) => {
    if (!selected) return;
    await fetch(
      `/api/dashboards/${selected.id}/widgets?widgetId=${widgetId}`,
      { method: "DELETE" }
    );
    setSelected((prev) =>
      prev ? { ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) } : prev
    );
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === selected.id
          ? { ...d, widgetCount: Math.max(0, d.widgetCount - 1) }
          : d
      )
    );
    if (focusedWidget?.id === widgetId) setFocusedWidget(null);
  };

  // ── Refresh widget ────────────────────────────────────────────────────────
  const refreshWidget = async (widget: DashboardWidget) => {
    if (!widget.dataQuery) return;
    try {
      const res = await fetch("/api/dashboards/refresh-widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: widget.dataSourceId,
          sql: widget.dataQuery,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Refresh failed");
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              widgets: prev.widgets.map((w) =>
                w.id === widget.id
                  ? { ...w, chartConfig: { ...w.chartConfig, data: json.data.rows } }
                  : w
              ),
            }
          : prev
      );
      toast({ title: "Refreshed", description: `"${widget.title}" data reloaded.` });
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    }
  };

  // ── Inline widget rename ──────────────────────────────────────────────────
  const saveWidgetRename = async (widgetId: string, title: string) => {
    setRenamingWidgetId(null);
    if (!title.trim() || !selected) return;
    try {
      await fetch(
        `/api/dashboards/${selected.id}/widgets?widgetId=${widgetId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        }
      );
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              widgets: prev.widgets.map((w) =>
                w.id === widgetId ? { ...w, title: title.trim() } : w
              ),
            }
          : prev
      );
    } catch {}
  };

  // ── Open edit dialog ──────────────────────────────────────────────────────
  const openEditDialog = async (widget: DashboardWidget) => {
    setEditingWidget(null);
    setEditPreview(null);
    setEditSchema({ columns: [], rows: [] });
    setEditTitle("");
    setEditPrompt("");
    setEditBuildMode("manual");
    setEditSchemaLoading(true);
    setEditDialogOpen(true);
    setEditingWidget(widget);
    setEditTitle(widget.title);
    setEditPrompt(widget.prompt || "");
    setEditPreview(widget.chartConfig);
    if (connections.length === 0) {
      try {
        const res = await fetch("/api/store?key=nexus_databases");
        const json = await res.json();
        setConnections(json.data || []);
      } catch {}
    }
    try {
      if (widget.dataSourceType === "database") {
        const tableName =
          widget.dataSourceName.split(" / ").pop()?.split(" ⋈")[0]?.trim() || "";
        if (tableName) {
          const res = await fetch(
            `/api/dashboards/schema?connectionId=${widget.dataSourceId}&table=${encodeURIComponent(tableName)}`
          );
          const json = await res.json();
          setEditSchema({
            columns: json.data?.columns || [],
            rows: json.data?.sampleRows || [],
          });
        }
      } else {
        const res = await fetch(
          `/api/files?type=content&fileId=${widget.dataSourceId}`
        );
        const json = await res.json();
        if (json.data?.content) {
          const parsed = parseFile(json.data.content, widget.dataSourceName);
          setEditSchema({ columns: parsed.columns, rows: parsed.rows });
        }
      }
    } catch {}
    setEditSchemaLoading(false);
  };

  // ── AI re-generate in edit dialog ─────────────────────────────────────────
  const runEditGenerate = async () => {
    if (!editingWidget) return;
    setEditGenerating(true);
    try {
      const tableName =
        editingWidget.dataSourceName.split(" / ").pop()?.split(" ⋈")[0]?.trim() || "";
      const conn = connections.find((c) => c.id === editingWidget.dataSourceId);
      const result = await generateChart(
        editingWidget.dataSourceType === "database"
          ? {
              sourceType: "database",
              tableName,
              columns: editSchema.columns,
              sampleRows: editSchema.rows,
              prompt: editPrompt,
              dbType: conn?.type,
              connectionId: editingWidget.dataSourceId,
              userId: user?.uid,
              preferredModel: visualizeModel,
            }
          : {
              sourceType: "file",
              tableName: editingWidget.dataSourceName,
              columns: editSchema.columns,
              sampleRows: editSchema.rows.slice(0, 5),
              allRows: editSchema.rows,
              prompt: editPrompt,
              preferredModel: visualizeModel,
            }
      );
      setEditPreview(result);
      setEditTitle(result.title);
    } catch (err: any) {
      const msg: string = err.message || "";
      const friendly =
        msg.includes("429") || msg.toLowerCase().includes("quota")
          ? "AI quota exceeded. Try again later or switch model in Settings."
          : msg.includes("401") || msg.toLowerCase().includes("api key")
          ? "Invalid or missing API key."
          : msg;
      toast({ title: "Re-generation failed", description: friendly, variant: "destructive" });
    }
    setEditGenerating(false);
  };

  // ── Save edited widget ────────────────────────────────────────────────────
  const saveEditWidget = async () => {
    if (!editingWidget || !editPreview || !selected) return;
    setEditSaving(true);
    try {
      const res = await fetch(
        `/api/dashboards/${selected.id}/widgets?widgetId=${editingWidget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle,
            chartType: editPreview.chartType,
            chartConfig: { ...editPreview, title: editTitle },
            dataQuery: editPreview.sql ?? null,
            prompt: editBuildMode === "ai" ? editPrompt : "",
          }),
        }
      );
      const json = await res.json();
      if (json.data) {
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                widgets: prev.widgets.map((w) =>
                  w.id === editingWidget.id ? json.data : w
                ),
              }
            : prev
        );
        setExpandedWidget((prev) =>
          prev?.id === editingWidget.id ? json.data : prev
        );
        if (focusedWidget?.id === editingWidget.id) setFocusedWidget(json.data);
        toast({ title: "Chart updated", description: `"${editTitle}" saved.` });
        setEditDialogOpen(false);
      } else {
        toast({ title: "Update failed", description: json.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
    setEditSaving(false);
  };

  // ── Toggle widget width ───────────────────────────────────────────────────
  const toggleWidgetWidth = async (widget: DashboardWidget) => {
    if (!selected) return;
    const newW = widget.gridW === 2 ? 1 : 2;
    try {
      await fetch(
        `/api/dashboards/${selected.id}/widgets?widgetId=${widget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gridW: newW }),
        }
      );
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              widgets: prev.widgets.map((w) =>
                w.id === widget.id ? { ...w, gridW: newW } : w
              ),
            }
          : prev
      );
    } catch {}
  };

  // ── Apply global filters at render time ───────────────────────────────────
  function applyGlobalFilters(config: GeneratedChartConfig): GeneratedChartConfig {
    if (!globalFilters.length) return config;
    const active = globalFilters.filter((f) => f.column && f.operator);
    if (!active.length) return config;
    const filtered = config.data.filter((row) =>
      active.every((f) => {
        const val = row[f.column];
        const strVal = String(val ?? "").toLowerCase();
        const fv = (f.value ?? "").toLowerCase();
        switch (f.operator) {
          case "=": return String(val) === f.value;
          case "!=": return String(val) !== f.value;
          case ">": return Number(val) > Number(f.value);
          case "<": return Number(val) < Number(f.value);
          case ">=": return Number(val) >= Number(f.value);
          case "<=": return Number(val) <= Number(f.value);
          case "contains": return strVal.includes(fv);
          case "not_contains": return !strVal.includes(fv);
          case "is_empty": return val == null || String(val) === "";
          case "is_not_empty": return val != null && String(val) !== "";
          default: return true;
        }
      })
    );
    return { ...config, data: filtered };
  }

  // ── Load data panel schema for focused widget ─────────────────────────────
  useEffect(() => {
    if (!focusedWidget) { setDataPanelSchema([]); return; }
    setDataPanelLoading(true);
    const loadSchema = async () => {
      try {
        if (focusedWidget.dataSourceType === "database") {
          const tableName = focusedWidget.dataSourceName
            .split(" / ").pop()?.split(" ⋈")[0]?.trim() || "";
          if (!tableName) return;
          const res = await fetch(
            `/api/dashboards/schema?connectionId=${focusedWidget.dataSourceId}&table=${encodeURIComponent(tableName)}`
          );
          const json = await res.json();
          setDataPanelSchema(json.data?.columns || []);
        } else {
          // Derive from chart config data
          if (focusedWidget.chartConfig?.data?.[0]) {
            const cols: SchemaColumn[] = Object.keys(
              focusedWidget.chartConfig.data[0]
            ).map((k) => ({
              name: k,
              type:
                typeof focusedWidget.chartConfig.data[0][k] === "number"
                  ? "number"
                  : "text",
            }));
            setDataPanelSchema(cols);
          }
        }
      } catch {}
      setDataPanelLoading(false);
    };
    loadSchema();
  }, [focusedWidget?.id]); // eslint-disable-line

  // ── Wizard step validation ────────────────────────────────────────────────
  const canProceed = () => {
    if (step === 0) return true;
    if (step === 1) {
      if (sourceType === "database")
        return !!selectedTable && tableSchema.columns.length > 0;
      return !!selectedFile && !!fileSchema;
    }
    if (step === 2) {
      if (buildMode === "manual") return !!preview;
      return prompt.trim().length > 3;
    }
    return false;
  };

  // ── Utility ───────────────────────────────────────────────────────────────
  function isNumericType(t: string) {
    return ["number", "integer", "float", "decimal", "numeric", "bigint", "int4", "int8", "float4", "float8", "double precision"].includes(t.toLowerCase());
  }

  const activeFilterCount = globalFilters.filter((f) => f.column).length;

  // ── Workflow step indicator ───────────────────────────────────────────────
  const workflowStep = selected
    ? selected.widgets.length > 0
      ? activeFilterCount > 0 ? 3 : 2
      : 1
    : 0;

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <BarChart2 className="size-12 mx-auto mb-4 opacity-20" />
          <p>Sign in to use Visualize</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">

      {/* ════════════════ LEFT SIDEBAR — Dashboards ════════════════ */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-card/40">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="size-4 text-accent shrink-0" />
            <h2 className="font-bold text-sm">Dashboards</h2>
          </div>
          {showNewDash ? (
            <div className="flex gap-1">
              <Input
                autoFocus
                value={newDashName}
                onChange={(e) => setNewDashName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createDashboard();
                  if (e.key === "Escape") setShowNewDash(false);
                }}
                placeholder="Dashboard name…"
                className="h-8 text-xs"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={createDashboard}
                disabled={creatingDash}
              >
                {creatingDash ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={() => setShowNewDash(false)}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowNewDash(true)}
            >
              <Plus className="size-3 mr-1" /> New Dashboard
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {dashLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin size-5 text-accent" />
              </div>
            ) : dashboards.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-2">
                No dashboards yet. Create one above.
              </p>
            ) : (
              dashboards.map((d) => (
                <div
                  key={d.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    selected?.id === d.id
                      ? "bg-accent/15 text-accent"
                      : "hover:bg-accent/5 text-foreground/80"
                  }`}
                  onClick={() => {
                    if (renamingId !== d.id) loadDetail(d.id);
                  }}
                >
                  <LayoutDashboard className="size-3.5 shrink-0" />
                  {renamingId === d.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(d.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => saveRename(d.id)}
                      className="h-6 text-xs px-1 flex-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-xs truncate flex-1 font-medium">
                      {d.name}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {d.widgetCount}
                  </Badge>
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(d.id);
                        setRenameValue(d.name);
                      }}
                    >
                      <PencilLine className="size-2.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-5 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDashboard(d.id);
                      }}
                    >
                      <Trash2 className="size-2.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* ════════════════ CENTER — Canvas ════════════════ */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selected ? (
          /* Empty state — workflow guidance */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground overflow-auto">
            <BarChart2 className="size-14 mb-6 opacity-10" />
            <h3 className="text-xl font-bold mb-2 text-foreground">
              Start with a Dashboard
            </h3>
            <p className="text-sm text-center max-w-sm mb-10">
              Create a dashboard, then follow the BI workflow to connect data,
              build visualizations, and apply filters.
            </p>

            {/* Workflow steps */}
            <div className="flex items-center gap-0 max-w-2xl w-full">
              {WORKFLOW.map((ws, i) => {
                const Icon = ws.icon;
                const active = i <= workflowStep;
                return (
                  <div key={ws.label} className="flex items-center flex-1">
                    <div
                      className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                        active
                          ? "border-accent/40 bg-accent/5"
                          : "border-border/40 bg-card/20"
                      }`}
                    >
                      <div
                        className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          active
                            ? "bg-accent text-accent-foreground"
                            : "bg-secondary/50 text-muted-foreground"
                        }`}
                      >
                        {i < workflowStep ? (
                          <Check className="size-4" />
                        ) : (
                          <Icon className="size-4" />
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-medium text-center ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {ws.label}
                      </span>
                    </div>
                    {i < WORKFLOW.length - 1 && (
                      <ArrowRight className="size-3 text-border mx-1 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-8">
              Create a dashboard from the left panel to begin.
            </p>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="animate-spin size-8 text-accent" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Dashboard header (sticky) */}
            <div className="shrink-0 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm flex items-center gap-3">
              {/* Workflow breadcrumb */}
              <div className="hidden md:flex items-center gap-1.5 mr-2">
                {WORKFLOW.map((ws, i) => {
                  const Icon = ws.icon;
                  const done = i < workflowStep;
                  const cur = i === workflowStep;
                  return (
                    <div key={ws.label} className="flex items-center gap-1.5">
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                          done
                            ? "bg-accent/20 text-accent"
                            : cur
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground/40"
                        }`}
                      >
                        <Icon className="size-2.5" />
                        <span className="hidden lg:inline">{ws.label}</span>
                      </div>
                      {i < WORKFLOW.length - 1 && (
                        <ChevronRight className="size-2.5 text-border" />
                      )}
                    </div>
                  );
                })}
              </div>

              <Separator orientation="vertical" className="h-6 hidden md:block" />

              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold truncate">{selected.name}</h1>
                <p className="text-[10px] text-muted-foreground">
                  {selected.widgets.length} chart
                  {selected.widgets.length !== 1 ? "s" : ""}
                  {activeFilterCount > 0 && (
                    <span className="ml-2 text-accent">
                      · {activeFilterCount} active filter
                      {activeFilterCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className={`gap-1.5 text-xs h-8 ${activeFilterCount > 0 ? "border-accent text-accent" : ""}`}
                  onClick={() => setRightPanelTab("filters")}
                >
                  <Filter className="size-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 bg-accent text-accent-foreground rounded-full px-1.5 text-[9px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                <Button onClick={openWizard} className="gap-1.5 h-8 text-xs">
                  <Plus className="size-3.5" /> Add Chart
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  title={rightPanelOpen ? "Hide data panel" : "Show data panel"}
                  onClick={() => setRightPanelOpen((v) => !v)}
                >
                  {rightPanelOpen ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Chart grid (scrollable) */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                {selected.widgets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                    <Sparkles className="size-10 mb-4 opacity-20" />
                    <p className="text-sm font-medium">No charts yet</p>
                    <p className="text-xs mt-1 mb-4">
                      Click &quot;Add Chart&quot; to configure your first visualization
                    </p>
                    <Button size="sm" onClick={openWizard} className="gap-2">
                      <Plus className="size-3.5" /> Add Chart
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {selected.widgets.map((widget) => (
                      <Card
                        key={widget.id}
                        className={`glass-panel border-border/40 overflow-hidden cursor-pointer transition-all ${
                          widget.gridW === 2 ? "lg:col-span-2" : ""
                        } ${
                          focusedWidget?.id === widget.id
                            ? "ring-2 ring-accent/40 border-accent/30"
                            : "hover:border-border/70"
                        }`}
                        onClick={() =>
                          setFocusedWidget((prev) =>
                            prev?.id === widget.id ? null : widget
                          )
                        }
                      >
                        <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                          <div className="flex-1 min-w-0 mr-2">
                            {renamingWidgetId === widget.id ? (
                              <Input
                                autoFocus
                                value={renameWidgetValue}
                                onChange={(e) =>
                                  setRenameWidgetValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    saveWidgetRename(
                                      widget.id,
                                      renameWidgetValue
                                    );
                                  if (e.key === "Escape")
                                    setRenamingWidgetId(null);
                                }}
                                onBlur={() =>
                                  saveWidgetRename(
                                    widget.id,
                                    renameWidgetValue
                                  )
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 text-sm font-semibold px-1.5"
                              />
                            ) : (
                              <CardTitle
                                className="text-sm font-semibold truncate cursor-pointer hover:text-accent transition-colors"
                                title="Click to rename"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingWidgetId(widget.id);
                                  setRenameWidgetValue(widget.title);
                                }}
                              >
                                {widget.title}
                              </CardTitle>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {widget.dataSourceName}
                            </p>
                          </div>
                          <div
                            className="flex gap-0.5 shrink-0 items-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Badge
                              variant="outline"
                              className="text-[9px] font-mono mr-0.5"
                            >
                              {widget.chartType}
                            </Badge>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title={
                                widget.gridW === 2
                                  ? "Shrink to half"
                                  : "Expand to full width"
                              }
                              onClick={() => toggleWidgetWidth(widget)}
                            >
                              {widget.gridW === 2 ? (
                                <Square className="size-3" />
                              ) : (
                                <Columns className="size-3" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title="Full screen"
                              onClick={() => setExpandedWidget(widget)}
                            >
                              <Maximize2 className="size-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              title="Edit chart"
                              onClick={() => openEditDialog(widget)}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            {widget.dataSourceType === "database" &&
                              widget.dataQuery && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  title="Refresh data"
                                  onClick={() => refreshWidget(widget)}
                                >
                                  <RefreshCw className="size-3" />
                                </Button>
                              )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 hover:text-destructive"
                              title="Delete"
                              onClick={() => deleteWidget(widget.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <ChartRenderer
                            config={applyGlobalFilters(widget.chartConfig)}
                            height={240}
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </main>

      {/* ════════════════ RIGHT PANEL — Data / Filters / Properties ════════════════ */}
      {rightPanelOpen && selected && (
        <aside className="w-[280px] shrink-0 border-l border-border flex flex-col bg-card/40">
          <Tabs
            value={rightPanelTab}
            onValueChange={setRightPanelTab}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-10 shrink-0 px-2 gap-0">
              <TabsTrigger
                value="data"
                className="flex-1 text-[11px] rounded-md"
              >
                <Layers className="size-3 mr-1" />
                Data
              </TabsTrigger>
              <TabsTrigger
                value="filters"
                className="flex-1 text-[11px] rounded-md"
              >
                <Filter className="size-3 mr-1" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 bg-accent text-accent-foreground rounded-full px-1 text-[8px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="properties"
                className="flex-1 text-[11px] rounded-md"
              >
                <Settings2 className="size-3 mr-1" />
                Props
              </TabsTrigger>
            </TabsList>

            {/* ── DATA TAB ── */}
            <TabsContent
              value="data"
              className="flex-1 min-h-0 overflow-hidden mt-0"
            >
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {!focusedWidget ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <Database className="size-8 mb-3 opacity-20" />
                      <p className="text-xs font-medium">No chart selected</p>
                      <p className="text-[10px] mt-1 opacity-70">
                        Click a chart to see its data fields
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Source info */}
                      <div className="rounded-xl border border-border/50 bg-secondary/10 p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          {focusedWidget.dataSourceType === "database" ? (
                            <Database className="size-3.5 text-accent shrink-0" />
                          ) : (
                            <FileText className="size-3.5 text-accent shrink-0" />
                          )}
                          <p className="text-xs font-bold truncate">
                            {focusedWidget.dataSourceName}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px]">
                          {focusedWidget.dataSourceType}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[9px] ml-1 font-mono"
                        >
                          {focusedWidget.chartType}
                        </Badge>
                      </div>

                      {/* Fields list */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          Fields
                        </p>
                        {dataPanelLoading ? (
                          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" /> Loading…
                          </div>
                        ) : dataPanelSchema.length === 0 ? (
                          <p className="text-xs text-muted-foreground opacity-60">
                            No field info available
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {/* Dimensions */}
                            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mt-2 mb-1">
                              Dimensions
                            </p>
                            {dataPanelSchema
                              .filter((c) => !isNumericType(c.type))
                              .map((col) => (
                                <div
                                  key={col.name}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/20 group"
                                >
                                  <FieldIcon type={col.type} />
                                  <span className="text-xs font-mono truncate flex-1">
                                    {col.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100"
                                  >
                                    {col.type}
                                  </Badge>
                                </div>
                              ))}

                            {/* Measures */}
                            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mt-3 mb-1">
                              Measures
                            </p>
                            {dataPanelSchema
                              .filter((c) => isNumericType(c.type))
                              .map((col) => (
                                <div
                                  key={col.name}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/20 group"
                                >
                                  <FieldIcon type={col.type} />
                                  <span className="text-xs font-mono truncate flex-1">
                                    {col.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100"
                                  >
                                    {col.type}
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* ── FILTERS TAB ── */}
            <TabsContent
              value="filters"
              className="flex-1 min-h-0 overflow-hidden mt-0"
            >
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Global Filters
                    </p>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => setGlobalFilters([])}
                        className="text-[10px] text-destructive/60 hover:text-destructive transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground/70">
                    Applies to all charts in this dashboard.
                  </p>

                  {globalFilters.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border-2 border-dashed border-border/40 rounded-xl">
                      <Filter className="size-6 mb-2 opacity-20" />
                      <p className="text-xs">No filters active</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {globalFilters.map((f, idx) => (
                      <div
                        key={f.id}
                        className="rounded-xl border border-border/50 bg-secondary/10 p-3 space-y-2"
                      >
                        {/* Column */}
                        <Select
                          value={f.column || "__none__"}
                          onValueChange={(v) =>
                            setGlobalFilters((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, column: v === "__none__" ? "" : v }
                                  : x
                              )
                            )
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select column…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value="__none__"
                              className="text-xs text-muted-foreground"
                            >
                              Select column…
                            </SelectItem>
                            {allWidgetColumns.map((col) => (
                              <SelectItem
                                key={col}
                                value={col}
                                className="text-xs font-mono"
                              >
                                {col}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex gap-2">
                          {/* Operator */}
                          <Select
                            value={f.operator}
                            onValueChange={(v) =>
                              setGlobalFilters((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        operator: v as ChartFilter["operator"],
                                      }
                                    : x
                                )
                              )
                            }
                          >
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[
                                { v: "=", l: "equals" },
                                { v: "!=", l: "not equals" },
                                { v: ">", l: "greater than" },
                                { v: "<", l: "less than" },
                                { v: ">=", l: ">= " },
                                { v: "<=", l: "<=" },
                                { v: "contains", l: "contains" },
                                { v: "not_contains", l: "not contains" },
                                { v: "is_empty", l: "is empty" },
                                { v: "is_not_empty", l: "not empty" },
                              ].map((op) => (
                                <SelectItem
                                  key={op.v}
                                  value={op.v}
                                  className="text-xs"
                                >
                                  {op.l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Remove */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 ml-auto hover:text-destructive shrink-0"
                            onClick={() =>
                              setGlobalFilters((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                          >
                            <X className="size-3" />
                          </Button>
                        </div>

                        {/* Value */}
                        {f.operator !== "is_empty" &&
                          f.operator !== "is_not_empty" && (
                            <Input
                              value={f.value}
                              onChange={(e) =>
                                setGlobalFilters((prev) =>
                                  prev.map((x, i) =>
                                    i === idx
                                      ? { ...x, value: e.target.value }
                                      : x
                                  )
                                )
                              }
                              className="h-7 text-xs"
                              placeholder="Value…"
                            />
                          )}
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs border-dashed"
                    onClick={() =>
                      setGlobalFilters((prev) => [
                        ...prev,
                        {
                          id: `gf${Date.now()}`,
                          column: "",
                          operator: "=",
                          value: "",
                        },
                      ])
                    }
                  >
                    <Plus className="size-3 mr-1" /> Add Filter
                  </Button>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* ── PROPERTIES TAB ── */}
            <TabsContent
              value="properties"
              className="flex-1 min-h-0 overflow-hidden mt-0"
            >
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {!focusedWidget ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <Settings2 className="size-8 mb-3 opacity-20" />
                      <p className="text-xs font-medium">No chart selected</p>
                      <p className="text-[10px] mt-1 opacity-70">
                        Click a chart to see its properties
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Chart Properties
                      </p>

                      <div className="rounded-xl border border-border/50 bg-secondary/10 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">
                            Title
                          </p>
                          <p className="text-xs font-medium truncate max-w-[160px]">
                            {focusedWidget.title}
                          </p>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">
                            Type
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono"
                          >
                            {focusedWidget.chartType}
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground shrink-0">
                            Source
                          </p>
                          <p className="text-[10px] text-right font-medium break-all">
                            {focusedWidget.dataSourceName}
                          </p>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">
                            Width
                          </p>
                          <p className="text-[10px] font-medium">
                            {focusedWidget.gridW === 2 ? "Full" : "Half"}
                          </p>
                        </div>
                        {focusedWidget.dataQuery && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">
                                Query
                              </p>
                              <code className="text-[9px] font-mono text-muted-foreground block bg-black/20 rounded-lg p-2 whitespace-pre-wrap break-all line-clamp-4">
                                {focusedWidget.dataQuery}
                              </code>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs gap-1.5"
                          onClick={() => openEditDialog(focusedWidget)}
                        >
                          <Pencil className="size-3" /> Edit Chart
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs gap-1.5"
                          onClick={() =>
                            toggleWidgetWidth(focusedWidget)
                          }
                        >
                          <Columns className="size-3" />
                          {focusedWidget.gridW === 2
                            ? "Shrink to Half"
                            : "Expand to Full"}
                        </Button>
                        {focusedWidget.dataSourceType === "database" &&
                          focusedWidget.dataQuery && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs gap-1.5"
                              onClick={() => refreshWidget(focusedWidget)}
                            >
                              <RefreshCw className="size-3" /> Refresh Data
                            </Button>
                          )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs gap-1.5 hover:text-destructive hover:border-destructive/40"
                          onClick={() => deleteWidget(focusedWidget.id)}
                        >
                          <Trash2 className="size-3" /> Delete Chart
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>
      )}

      {/* ════════════════ EXPAND (full-screen) DIALOG ════════════════ */}
      <Dialog
        open={!!expandedWidget}
        onOpenChange={(v) => {
          if (!v) setExpandedWidget(null);
        }}
      >
        <DialogContent className="glass-panel border-accent/20 sm:max-w-6xl max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base font-semibold truncate">
              {expandedWidget?.title}
            </DialogTitle>
            <DialogDescription className="text-[10px] truncate">
              {expandedWidget?.dataSourceName}
            </DialogDescription>
          </DialogHeader>
          {expandedWidget && (
            <div className="flex-1 min-h-0 pt-2">
              <ChartRenderer
                config={applyGlobalFilters(expandedWidget.chartConfig)}
                height={520}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════════════ EDIT CHART DIALOG ════════════════ */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(v) => {
          if (!v) setEditDialogOpen(false);
        }}
      >
        <DialogContent
          className={`glass-panel border-accent/20 ${
            editBuildMode === "manual"
              ? "sm:max-w-4xl max-h-[90vh] overflow-y-auto"
              : "sm:max-w-2xl"
          }`}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4 text-accent" /> Edit Chart
            </DialogTitle>
            <DialogDescription>
              Reconfigure with Manual Builder or re-generate with AI.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Chart Title
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="rounded-lg bg-black/20 border border-border/40 px-3 py-2 flex items-center gap-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                Source
              </p>
              <p className="text-xs font-medium truncate">
                {editingWidget?.dataSourceName}
              </p>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-black/20 border border-border/40 rounded-xl w-fit">
              <button
                onClick={() => setEditBuildMode("manual")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  editBuildMode === "manual"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sliders className="size-3" /> Manual Builder
              </button>
              <button
                onClick={() => setEditBuildMode("ai")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  editBuildMode === "ai"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3" /> AI Describe
              </button>
            </div>

            {editSchemaLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading schema…
              </div>
            )}

            {editBuildMode === "manual" && !editSchemaLoading && (
              <ManualChartBuilder
                columns={editSchema.columns}
                rows={editSchema.rows}
                sourceType={editingWidget?.dataSourceType || "database"}
                connectionId={
                  editingWidget?.dataSourceType === "database"
                    ? editingWidget.dataSourceId
                    : undefined
                }
                tableName={
                  editingWidget?.dataSourceName
                    .split(" / ")
                    .pop()
                    ?.split(" ⋈")[0]
                    ?.trim() || ""
                }
                dbType={
                  connections.find(
                    (c) => c.id === editingWidget?.dataSourceId
                  )?.type
                }
                onGenerate={(config, title) => {
                  setEditPreview(config);
                  setEditTitle(title);
                }}
              />
            )}

            {editBuildMode === "ai" && !editSchemaLoading && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Describe the chart
                  </label>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    className="resize-none text-sm"
                    rows={3}
                    placeholder="e.g. Show me revenue by month as a line chart…"
                  />
                </div>
                <Button
                  onClick={runEditGenerate}
                  disabled={!editPrompt.trim() || editGenerating}
                  className="w-full gap-2"
                >
                  {editGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" /> Re-generate Chart
                    </>
                  )}
                </Button>
                {editPreview && (
                  <div className="rounded-xl border border-border/40 bg-black/20 p-4">
                    <ChartRenderer
                      config={{ ...editPreview, title: editTitle }}
                      height={240}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-row justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveEditWidget}
              disabled={editSaving || !editPreview}
            >
              {editSaving ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════ ADD CHART WIZARD (Sheet) ════════════════ */}
      <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
        <SheetContent
          side="right"
          className={`flex flex-col p-0 overflow-hidden ${
            step === 2 && buildMode === "manual"
              ? "w-[700px] sm:max-w-[700px]"
              : "w-[520px] sm:max-w-[520px]"
          }`}
        >
          {/* Sheet header */}
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-accent" />
              Add Chart — {STEPS[step]}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Step {step + 1} of {STEPS.length}
            </SheetDescription>
            {/* Step progress */}
            <div className="flex gap-1 pt-1">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    i <= step ? "bg-accent" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </SheetHeader>

          {/* Sheet body (scrollable) */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4 space-y-4">

              {/* ── Step 0: Source type ── */}
              {step === 0 && (
                <div className="grid grid-cols-2 gap-3 py-2">
                  {(["database", "file"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSourceType(type)}
                      className={`p-5 rounded-xl border-2 text-left transition-all ${
                        sourceType === type
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      {type === "database" ? (
                        <Database className="size-7 mb-2 text-accent" />
                      ) : (
                        <FolderOpen className="size-7 mb-2 text-accent" />
                      )}
                      <p className="font-semibold text-sm">
                        {type === "database" ? "Database" : "Files"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {type === "database"
                          ? "Query a connected database table"
                          : "Visualize an uploaded CSV or JSON file"}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* ── Step 1: DB path ── */}
              {step === 1 && sourceType === "database" && (
                <div className="space-y-4">
                  {/* Connection */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Database Connection
                    </label>
                    <Select
                      value={selectedConn}
                      onValueChange={(v) => {
                        setSelectedConn(v);
                        loadTables(v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a connection…" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {connections.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No database connections found. Add one in Databases.
                      </p>
                    )}
                  </div>

                  {/* Primary table */}
                  {selectedConn && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Primary Table
                      </label>
                      {tablesLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                          <Loader2 className="size-3.5 animate-spin" /> Loading tables…
                        </div>
                      ) : (
                        <Select
                          value={selectedTable}
                          onValueChange={(v) => {
                            setSelectedTable(v);
                            loadTableSchema(v);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a table…" />
                          </SelectTrigger>
                          <SelectContent>
                            {tables.map((t) => (
                              <SelectItem key={t} value={t}>
                                <Table className="size-3 inline mr-1" />
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {schemaLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Loading schema…
                    </div>
                  )}

                  {/* Schema preview */}
                  {selectedTable && tableSchema.columns.length > 0 && (
                    <div className="rounded-xl bg-black/20 border border-border/40 p-3">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                        Columns ({tableSchema.columns.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {tableSchema.columns.map((c) => (
                          <Badge
                            key={c.name}
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            <FieldIcon type={c.type} />
                            <span className="ml-1">{c.name}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── JOIN BUILDER ── */}
                  {selectedTable && tableSchema.columns.length > 0 && (
                    <div className="rounded-xl border border-border/50 overflow-hidden">
                      {/* Join header toggle */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium hover:bg-secondary/10 transition-colors"
                        onClick={() => setJoinEnabled((v) => !v)}
                      >
                        <div className="flex items-center gap-2">
                          <GitMerge className="size-3.5 text-accent" />
                          <span>Join with another table</span>
                          {joinPreviewData && (
                            <Badge variant="outline" className="text-[9px] text-accent border-accent/30">
                              Active
                            </Badge>
                          )}
                        </div>
                        {joinEnabled ? (
                          <ChevronUp className="size-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-3.5 text-muted-foreground" />
                        )}
                      </button>

                      {joinEnabled && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border/40 bg-secondary/5">
                          <p className="text-[10px] text-muted-foreground pt-3">
                            Select a second table and define the join condition.
                          </p>

                          {/* Visual join tables */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-accent mb-1">
                                Left Table
                              </p>
                              <p className="text-xs font-mono font-bold">
                                {selectedTable}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {tableSchema.columns.length} columns
                              </p>
                            </div>
                            <div className="rounded-lg border border-border/50 bg-secondary/10 p-3">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                Right Table
                              </p>
                              {joinConfig.table2 ? (
                                <>
                                  <p className="text-xs font-mono font-bold">
                                    {joinConfig.table2}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {joinTable2Schema.length} columns
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">
                                  Not selected
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Join type */}
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                              Join Type
                            </label>
                            <Select
                              value={joinConfig.joinType}
                              onValueChange={(v) =>
                                setJoinConfig((prev) => ({
                                  ...prev,
                                  joinType: v as JoinConfig["joinType"],
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="INNER" className="text-xs">
                                  INNER JOIN — matching rows only
                                </SelectItem>
                                <SelectItem value="LEFT" className="text-xs">
                                  LEFT JOIN — all left + matching right
                                </SelectItem>
                                <SelectItem value="RIGHT" className="text-xs">
                                  RIGHT JOIN — matching left + all right
                                </SelectItem>
                                <SelectItem
                                  value="FULL OUTER"
                                  className="text-xs"
                                >
                                  FULL OUTER JOIN — all rows from both
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Table 2 selection */}
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                              Right Table
                            </label>
                            <Select
                              value={joinConfig.table2 || "__none__"}
                              onValueChange={(v) => {
                                const t = v === "__none__" ? "" : v;
                                setJoinConfig((prev) => ({
                                  ...prev,
                                  table2: t,
                                  leftCol: "",
                                  rightCol: "",
                                }));
                                if (t) loadTable2Schema(t);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select table…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem
                                  value="__none__"
                                  className="text-xs text-muted-foreground"
                                >
                                  Select table…
                                </SelectItem>
                                {tables
                                  .filter((t) => t !== selectedTable)
                                  .map((t) => (
                                    <SelectItem
                                      key={t}
                                      value={t}
                                      className="text-xs"
                                    >
                                      {t}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Join condition */}
                          {joinConfig.table2 && (
                            <div>
                              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                                Join Condition
                              </label>
                              {joinTable2Loading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Loader2 className="size-3 animate-spin" /> Loading…
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={joinConfig.leftCol || "__none__"}
                                    onValueChange={(v) =>
                                      setJoinConfig((prev) => ({
                                        ...prev,
                                        leftCol: v === "__none__" ? "" : v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs flex-1">
                                      <SelectValue placeholder="Left col…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem
                                        value="__none__"
                                        className="text-xs text-muted-foreground"
                                      >
                                        Left col…
                                      </SelectItem>
                                      {tableSchema.columns.map((c) => (
                                        <SelectItem
                                          key={c.name}
                                          value={c.name}
                                          className="text-xs font-mono"
                                        >
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Link2 className="size-3.5 text-accent shrink-0" />
                                  <Select
                                    value={joinConfig.rightCol || "__none__"}
                                    onValueChange={(v) =>
                                      setJoinConfig((prev) => ({
                                        ...prev,
                                        rightCol: v === "__none__" ? "" : v,
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs flex-1">
                                      <SelectValue placeholder="Right col…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem
                                        value="__none__"
                                        className="text-xs text-muted-foreground"
                                      >
                                        Right col…
                                      </SelectItem>
                                      {joinTable2Schema.map((c) => (
                                        <SelectItem
                                          key={c.name}
                                          value={c.name}
                                          className="text-xs font-mono"
                                        >
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Preview join button */}
                          {joinConfig.table2 &&
                            joinConfig.leftCol &&
                            joinConfig.rightCol && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-8 text-xs gap-1.5 border-accent/40 text-accent hover:bg-accent/10"
                                onClick={previewJoin}
                                disabled={joinPreviewLoading}
                              >
                                {joinPreviewLoading ? (
                                  <>
                                    <Loader2 className="size-3 animate-spin" />{" "}
                                    Previewing…
                                  </>
                                ) : (
                                  <>
                                    <GitMerge className="size-3" /> Apply &amp;
                                    Preview Join
                                  </>
                                )}
                              </Button>
                            )}

                          {/* Join preview result */}
                          {joinPreviewData && (
                            <div className="rounded-xl bg-accent/5 border border-accent/20 p-3">
                              <p className="text-[10px] font-bold text-accent mb-2">
                                ✓ Join applied — {joinPreviewData.columns.length}{" "}
                                combined columns
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {joinPreviewData.columns
                                  .slice(0, 8)
                                  .map((c) => (
                                    <Badge
                                      key={c.name}
                                      variant="outline"
                                      className="text-[9px] font-mono border-accent/30"
                                    >
                                      {c.name}
                                    </Badge>
                                  ))}
                                {joinPreviewData.columns.length > 8 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] text-muted-foreground"
                                  >
                                    +{joinPreviewData.columns.length - 8} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── DATA PREPARATION ── */}
                  {fieldMappings.length > 0 && (
                    <div className="rounded-xl border border-border/50 overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium hover:bg-secondary/10 transition-colors"
                        onClick={() =>
                          setEditingFieldIdx((v) => (v !== null ? null : -1))
                        }
                      >
                        <div className="flex items-center gap-2">
                          <Layers className="size-3.5 text-muted-foreground" />
                          <span>Data Preparation</span>
                          <Badge variant="outline" className="text-[9px]">
                            {fieldMappings.filter((f) => !f.hidden).length} /{" "}
                            {fieldMappings.length} fields
                          </Badge>
                        </div>
                        {editingFieldIdx !== null ? (
                          <ChevronUp className="size-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-3.5 text-muted-foreground" />
                        )}
                      </button>

                      {editingFieldIdx !== null && (
                        <div className="border-t border-border/40 bg-secondary/5">
                          <div className="px-4 py-2 space-y-0.5 max-h-48 overflow-y-auto">
                            {fieldMappings.map((fm, idx) => (
                              <div
                                key={fm.originalName}
                                className="flex items-center gap-2 py-1.5 group"
                              >
                                <FieldIcon
                                  type={
                                    fm.fieldType === "measure"
                                      ? "number"
                                      : "text"
                                  }
                                />
                                {editingFieldIdx === idx ? (
                                  <Input
                                    autoFocus
                                    value={editingFieldName}
                                    onChange={(e) =>
                                      setEditingFieldName(e.target.value)
                                    }
                                    onBlur={() => {
                                      setFieldMappings((prev) =>
                                        prev.map((f, i) =>
                                          i === idx
                                            ? {
                                                ...f,
                                                displayName:
                                                  editingFieldName.trim() ||
                                                  f.originalName,
                                              }
                                            : f
                                        )
                                      );
                                      setEditingFieldIdx(-1);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === "Escape")
                                        (e.target as HTMLInputElement).blur();
                                    }}
                                    className="h-6 text-xs px-1.5 flex-1"
                                  />
                                ) : (
                                  <span
                                    className={`text-xs flex-1 truncate font-mono ${
                                      fm.hidden ? "opacity-40 line-through" : ""
                                    }`}
                                  >
                                    {fm.displayName}
                                  </span>
                                )}
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-5"
                                    title="Rename field"
                                    onClick={() => {
                                      setEditingFieldIdx(idx);
                                      setEditingFieldName(fm.displayName);
                                    }}
                                  >
                                    <Pencil className="size-2.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-5"
                                    title={fm.hidden ? "Show field" : "Hide field"}
                                    onClick={() =>
                                      setFieldMappings((prev) =>
                                        prev.map((f, i) =>
                                          i === idx
                                            ? { ...f, hidden: !f.hidden }
                                            : f
                                        )
                                      )
                                    }
                                  >
                                    {fm.hidden ? (
                                      <Eye className="size-2.5" />
                                    ) : (
                                      <EyeOff className="size-2.5" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 1: File path ── */}
              {step === 1 && sourceType === "file" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Folder
                    </label>
                    <Select
                      value={selectedFolder}
                      onValueChange={(v) => {
                        setSelectedFolder(v);
                        loadFolderFiles(v);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a folder…" />
                      </SelectTrigger>
                      <SelectContent>
                        {folders.map((f: any) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {folders.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No folders found. Upload files in the Files section.
                      </p>
                    )}
                  </div>

                  {selectedFolder && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        File (CSV / JSON / TSV)
                      </label>
                      {folderFilesLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                          <Loader2 className="size-3.5 animate-spin" /> Loading files…
                        </div>
                      ) : folderFiles.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No CSV or JSON files in this folder.
                        </p>
                      ) : (
                        <Select
                          value={selectedFile}
                          onValueChange={(v) => {
                            setSelectedFile(v);
                            loadFile(v);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a file…" />
                          </SelectTrigger>
                          <SelectContent>
                            {folderFiles.map((f: any) => (
                              <SelectItem key={f.id} value={f.id}>
                                <FileText className="size-3 inline mr-1" />
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {fileLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Parsing file…
                    </div>
                  )}

                  {fileSchema && (
                    <div className="rounded-xl bg-black/20 border border-border/40 p-3">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                        Columns ({fileSchema.columns.length}) ·{" "}
                        {fileSchema.rows.length} rows
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {fileSchema.columns.map((c) => (
                          <Badge
                            key={c.name}
                            variant="outline"
                            className="text-[10px] font-mono"
                          >
                            <FieldIcon type={c.type} />
                            <span className="ml-1">{c.name}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 2: Configure chart ── */}
              {step === 2 && (
                <div className="space-y-3">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1.5 p-1 bg-black/20 border border-border/40 rounded-xl w-fit">
                    <button
                      onClick={() => {
                        setBuildMode("manual");
                        setPreview(null);
                        setPreviewTitle("");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        buildMode === "manual"
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sliders className="size-3" /> Manual Builder
                    </button>
                    <button
                      onClick={() => {
                        setBuildMode("ai");
                        setPreview(null);
                        setPreviewTitle("");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        buildMode === "ai"
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="size-3" /> AI Describe
                    </button>
                  </div>

                  {/* Source badge */}
                  <div className="rounded-lg bg-black/20 border border-border/40 px-3 py-2 flex items-center gap-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                      Source
                    </p>
                    <p className="text-xs font-medium truncate">
                      {sourceType === "database"
                        ? joinPreviewData
                          ? `${connections.find((c) => c.id === selectedConn)?.name} / ${selectedTable} ⋈ ${joinConfig.table2}`
                          : `${connections.find((c) => c.id === selectedConn)?.name} → ${selectedTable}`
                        : folderFiles.find((f) => f.id === selectedFile)?.name}
                    </p>
                  </div>

                  {buildMode === "manual" && (
                    <ManualChartBuilder
                      columns={
                        sourceType === "database"
                          ? tableSchema.columns
                          : fileSchema?.columns || []
                      }
                      rows={
                        sourceType === "database"
                          ? tableSchema.sampleRows
                          : fileSchema?.rows || []
                      }
                      sourceType={sourceType}
                      connectionId={selectedConn || undefined}
                      tableName={
                        joinPreviewData
                          ? `(${buildJoinSQL(selectedTable, joinTable2Schema, joinConfig)}) AS jd`
                          : selectedTable ||
                            folderFiles.find((f) => f.id === selectedFile)?.name ||
                            ""
                      }
                      dbType={
                        connections.find((c) => c.id === selectedConn)?.type
                      }
                      onGenerate={(config, title) => {
                        setPreview(config);
                        setPreviewTitle(title);
                      }}
                    />
                  )}

                  {buildMode === "ai" && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Describe the chart you want
                      </label>
                      <Textarea
                        autoFocus
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g. Show sales by region as a bar chart, or Monthly revenue trend over time"
                        className="resize-none text-sm"
                        rows={4}
                      />
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Be specific about columns and aggregation you want.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 3: Preview ── */}
              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Chart Title
                    </label>
                    <Input
                      value={previewTitle}
                      onChange={(e) => setPreviewTitle(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  {preview && (
                    <div className="rounded-xl border border-border/40 bg-black/20 p-4">
                      <ChartRenderer
                        config={{ ...preview, title: previewTitle }}
                        height={260}
                      />
                    </div>
                  )}
                  {preview && (
                    <div className="text-[10px] text-muted-foreground flex flex-wrap gap-3">
                      <span>
                        Type: <strong>{preview.chartType}</strong>
                      </span>
                      <span>
                        Rows: <strong>{preview.data?.length ?? 0}</strong>
                      </span>
                      {preview.sql && (
                        <span className="truncate max-w-xs font-mono">
                          SQL: {preview.sql.slice(0, 60)}…
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Sheet footer */}
          <div className="shrink-0 px-6 py-4 border-t border-border flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                step > 0 ? setStep((s) => s - 1) : setWizardOpen(false)
              }
            >
              {step === 0 ? "Cancel" : "← Back"}
            </Button>
            <div className="flex gap-2">
              {step < 2 && (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed()}
                >
                  Next <ChevronRight className="size-4 ml-1" />
                </Button>
              )}
              {step === 2 && buildMode === "manual" && (
                <Button
                  size="sm"
                  onClick={() => setStep(3)}
                  disabled={!preview}
                >
                  Use This Chart <ChevronRight className="size-4 ml-1" />
                </Button>
              )}
              {step === 2 && buildMode === "ai" && (
                <Button
                  size="sm"
                  onClick={runGenerate}
                  disabled={!canProceed() || generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4 mr-1" /> Generate Chart
                    </>
                  )}
                </Button>
              )}
              {step === 3 && (
                <Button
                  size="sm"
                  onClick={saveWidget}
                  disabled={saving || !preview}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" /> Saving…
                    </>
                  ) : (
                    "Save to Dashboard"
                  )}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
