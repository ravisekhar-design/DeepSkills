"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart2, Plus, Trash2, Loader2, Database, FolderOpen,
  ChevronRight, Sparkles, RefreshCw, LayoutDashboard, PencilLine,
  Check, X, Table, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { ChartRenderer } from "@/components/chart-renderer";
import { generateChart, type GeneratedChartConfig } from "@/ai/flows/chart-generation";
import type { DatabaseConnection } from "@/lib/store";

// ── Types ────────────────────────────────────────────────────────────────────

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
  dataSourceType: 'database' | 'file';
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

interface SchemaColumn { name: string; type: string; }

// ── Wizard step labels ────────────────────────────────────────────────────────

const STEPS = ['Data Source', 'Select Data', 'Describe Chart', 'Preview & Save'];

// ── File parser (client-side: CSV, TSV, JSON) ────────────────────────────────

function parseFile(content: string, fileName: string): { columns: SchemaColumn[]; rows: any[] } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // JSON: expect array of objects
  if (ext === 'json') {
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed) ? parsed : (parsed.data && Array.isArray(parsed.data) ? parsed.data : []);
      if (arr.length === 0) return { columns: [], rows: [] };
      const rows = arr.slice(0, 200);
      const keys: string[] = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r || {}))));
      const columns: SchemaColumn[] = keys.map((k: string) => ({
        name: k,
        type: typeof rows[0][k] === 'number' ? 'number' : 'text',
      }));
      return { columns, rows };
    } catch {
      return { columns: [], rows: [] };
    }
  }

  // CSV / TSV
  const delimiter = ext === 'tsv' ? '\t' : ',';
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1, 201).map(line => {
    const vals = line.split(delimiter);
    const obj: any = {};
    headers.forEach((h, i) => {
      const raw = (vals[i] ?? '').trim().replace(/^"|"$/g, '');
      obj[h] = isNaN(Number(raw)) || raw === '' ? raw : Number(raw);
    });
    return obj;
  });
  const columns: SchemaColumn[] = headers.map(h => ({
    name: h,
    type: rows.length > 0 && typeof rows[0][h] === 'number' ? 'number' : 'text',
  }));
  return { columns, rows };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VisualizePage() {
  const { user } = useUser();
  const { toast } = useToast();

  // Dashboard list
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [dashLoading, setDashLoading] = useState(false);
  const [selected, setSelected] = useState<DashboardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New dashboard inline form
  const [newDashName, setNewDashName] = useState('');
  const [creatingDash, setCreatingDash] = useState(false);
  const [showNewDash, setShowNewDash] = useState(false);

  // Rename dashboard
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Widget wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Step 0 — source type
  const [sourceType, setSourceType] = useState<'database' | 'file'>('database');

  // Step 1 DB path
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [selectedConn, setSelectedConn] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableSchema, setTableSchema] = useState<{ columns: SchemaColumn[]; sampleRows: any[] }>({ columns: [], sampleRows: [] });
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Step 1 File path
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [folderFilesLoading, setFolderFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState('');
  const [fileSchema, setFileSchema] = useState<{ columns: SchemaColumn[]; rows: any[] } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // Step 2 — prompt
  const [prompt, setPrompt] = useState('');

  // Step 3 — generated preview
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<GeneratedChartConfig | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load dashboards ──────────────────────────────────────────────────────

  const loadDashboards = useCallback(async () => {
    if (!user) return;
    setDashLoading(true);
    try {
      const res = await fetch('/api/dashboards');
      const json = await res.json();
      setDashboards(json.data || []);
    } catch { /* non-fatal */ }
    setDashLoading(false);
  }, [user?.uid]); // eslint-disable-line

  useEffect(() => { loadDashboards(); }, [loadDashboards]);

  // ── Load dashboard detail ────────────────────────────────────────────────

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/dashboards/${id}`);
      const json = await res.json();
      setSelected(json.data || null);
    } catch { /* non-fatal */ }
    setDetailLoading(false);
  };

  // ── Create dashboard ─────────────────────────────────────────────────────

  const createDashboard = async () => {
    if (!newDashName.trim()) return;
    setCreatingDash(true);
    try {
      const res = await fetch('/api/dashboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newDashName.trim() }) });
      const json = await res.json();
      if (json.data) {
        setDashboards(prev => [json.data, ...prev]);
        setNewDashName('');
        setShowNewDash(false);
        loadDetail(json.data.id);
      }
    } catch { /* non-fatal */ }
    setCreatingDash(false);
  };

  // ── Delete dashboard ─────────────────────────────────────────────────────

  const deleteDashboard = async (id: string) => {
    await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
    setDashboards(prev => prev.filter(d => d.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // ── Rename dashboard ─────────────────────────────────────────────────────

  const saveRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    await fetch(`/api/dashboards/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameValue.trim() }) });
    setDashboards(prev => prev.map(d => d.id === id ? { ...d, name: renameValue.trim() } : d));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, name: renameValue.trim() } : prev);
    setRenamingId(null);
  };

  // ── Open wizard ──────────────────────────────────────────────────────────

  const openWizard = async () => {
    // Pre-load connections + folders
    try {
      const [connRes, folderRes] = await Promise.all([
        fetch('/api/store?key=nexus_databases'),
        fetch('/api/files?type=folders'),
      ]);
      const connJson = await connRes.json();
      const folderJson = await folderRes.json();
      setConnections(connJson.data || []);
      setFolders(folderJson.data || []);
    } catch { /* non-fatal */ }

    // Reset state
    setStep(0);
    setSourceType('database');
    setSelectedConn(''); setTables([]); setSelectedTable(''); setTableSchema({ columns: [], sampleRows: [] });
    setSelectedFolder(''); setFolderFiles([]); setSelectedFile(''); setFileSchema(null);
    setPrompt(''); setPreview(null); setPreviewTitle('');
    setWizardOpen(true);
  };

  // ── Step 1 DB: load tables ───────────────────────────────────────────────

  const loadTables = async (connId: string) => {
    setTablesLoading(true);
    setTables([]); setSelectedTable(''); setTableSchema({ columns: [], sampleRows: [] });
    try {
      const res = await fetch(`/api/dashboards/schema?connectionId=${connId}`);
      const json = await res.json();
      setTables(json.data?.tables || []);
    } catch { /* non-fatal */ }
    setTablesLoading(false);
  };

  // ── Step 1 DB: load table schema ─────────────────────────────────────────

  const loadTableSchema = async (table: string) => {
    if (!selectedConn) return;
    setSchemaLoading(true);
    setTableSchema({ columns: [], sampleRows: [] });
    try {
      const res = await fetch(`/api/dashboards/schema?connectionId=${selectedConn}&table=${encodeURIComponent(table)}`);
      const json = await res.json();
      setTableSchema({ columns: json.data?.columns || [], sampleRows: json.data?.sampleRows || [] });
    } catch { /* non-fatal */ }
    setSchemaLoading(false);
  };

  // ── Step 1 File: load folder files ──────────────────────────────────────

  const loadFolderFiles = async (folderId: string) => {
    setFolderFilesLoading(true);
    setFolderFiles([]); setSelectedFile(''); setFileSchema(null);
    try {
      const res = await fetch(`/api/files?type=files&folderId=${folderId}`);
      const json = await res.json();
      setFolderFiles((json.data || []).filter((f: any) => /\.(csv|json|tsv)$/i.test(f.name)));
    } catch { /* non-fatal */ }
    setFolderFilesLoading(false);
  };

  // ── Step 1 File: load + parse file ──────────────────────────────────────

  const loadFile = async (fileId: string) => {
    setFileLoading(true);
    setFileSchema(null);
    try {
      const res = await fetch(`/api/files?type=content&fileId=${fileId}`);
      const json = await res.json();
      if (json.data?.content) {
        const fileName = folderFiles.find(f => f.id === fileId)?.name || '';
        const parsed = parseFile(json.data.content, fileName);
        setFileSchema(parsed);
      }
    } catch { /* non-fatal */ }
    setFileLoading(false);
  };

  // ── Step 2: generate chart ───────────────────────────────────────────────

  const runGenerate = async () => {
    setGenerating(true);
    setPreview(null);
    try {
      let result: GeneratedChartConfig;
      if (sourceType === 'database') {
        const conn = connections.find(c => c.id === selectedConn);
        result = await generateChart({
          sourceType: 'database',
          tableName: selectedTable,
          columns: tableSchema.columns,
          sampleRows: tableSchema.sampleRows,
          prompt,
          dbType: conn?.type,
          connectionId: selectedConn,
          userId: user?.uid,
        });
      } else {
        const file = folderFiles.find(f => f.id === selectedFile);
        result = await generateChart({
          sourceType: 'file',
          tableName: file?.name || 'data',
          columns: fileSchema?.columns || [],
          sampleRows: fileSchema?.rows?.slice(0, 5) || [],
          allRows: fileSchema?.rows,
          prompt,
        });
      }
      setPreview(result);
      setPreviewTitle(result.title);
      setStep(3);
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  // ── Step 3: save widget ──────────────────────────────────────────────────

  const saveWidget = async () => {
    if (!selected || !preview) return;
    setSaving(true);
    try {
      const conn = connections.find(c => c.id === selectedConn);
      const file = folderFiles.find(f => f.id === selectedFile);
      const res = await fetch(`/api/dashboards/${selected.id}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: previewTitle,
          chartType: preview.chartType,
          chartConfig: { ...preview, title: previewTitle },
          dataSourceType: sourceType,
          dataSourceId: sourceType === 'database' ? selectedConn : selectedFile,
          dataSourceName: sourceType === 'database' ? `${conn?.name} / ${selectedTable}` : file?.name,
          dataQuery: preview.sql,
          prompt,
          gridW: 1,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setSelected(prev => prev ? { ...prev, widgets: [...prev.widgets, json.data] } : prev);
        setDashboards(prev => prev.map(d => d.id === selected.id ? { ...d, widgetCount: d.widgetCount + 1 } : d));
        toast({ title: 'Chart added', description: `"${previewTitle}" added to ${selected.name}.` });
        setWizardOpen(false);
      } else {
        toast({ title: 'Save failed', description: json.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  // ── Delete widget ────────────────────────────────────────────────────────

  const deleteWidget = async (widgetId: string) => {
    if (!selected) return;
    await fetch(`/api/dashboards/${selected.id}/widgets?widgetId=${widgetId}`, { method: 'DELETE' });
    setSelected(prev => prev ? { ...prev, widgets: prev.widgets.filter(w => w.id !== widgetId) } : prev);
    setDashboards(prev => prev.map(d => d.id === selected.id ? { ...d, widgetCount: Math.max(0, d.widgetCount - 1) } : d));
  };

  // ── Refresh a database widget ────────────────────────────────────────────

  const refreshWidget = async (widget: DashboardWidget) => {
    if (!widget.dataQuery) return;
    try {
      const res = await fetch('/api/dashboards/refresh-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: widget.dataSourceId, sql: widget.dataQuery }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Refresh failed');
      setSelected(prev => prev ? {
        ...prev,
        widgets: prev.widgets.map(w => w.id === widget.id ? {
          ...w, chartConfig: { ...w.chartConfig, data: json.data.rows }
        } : w),
      } : prev);
      toast({ title: 'Refreshed', description: `"${widget.title}" data reloaded.` });
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err.message, variant: 'destructive' });
    }
  };

  // ── Wizard step validation ────────────────────────────────────────────────

  const canProceed = () => {
    if (step === 0) return true;
    if (step === 1) {
      if (sourceType === 'database') return !!selectedTable && tableSchema.columns.length > 0;
      return !!selectedFile && !!fileSchema;
    }
    if (step === 2) return prompt.trim().length > 3;
    return false;
  };

  // ── Render ───────────────────────────────────────────────────────────────

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

  return (
    <div className="flex h-[100dvh] overflow-hidden">

      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-card/40">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="size-5 text-accent" />
            <h2 className="font-bold text-sm">Dashboards</h2>
          </div>

          {showNewDash ? (
            <div className="flex gap-1">
              <Input
                autoFocus
                value={newDashName}
                onChange={e => setNewDashName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createDashboard(); if (e.key === 'Escape') setShowNewDash(false); }}
                placeholder="Dashboard name…"
                className="h-8 text-xs"
              />
              <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={createDashboard} disabled={creatingDash}>
                {creatingDash ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </Button>
              <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setShowNewDash(false)}>
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <Button size="sm" className="w-full h-8 text-xs" onClick={() => setShowNewDash(true)}>
              <Plus className="size-3 mr-1" /> New Dashboard
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {dashLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin size-5 text-accent" />
            </div>
          ) : dashboards.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-2">No dashboards yet. Create one above.</p>
          ) : dashboards.map(d => (
            <div
              key={d.id}
              className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${selected?.id === d.id ? 'bg-accent/15 text-accent' : 'hover:bg-accent/5 text-foreground/80'}`}
              onClick={() => { if (renamingId !== d.id) loadDetail(d.id); }}
            >
              <LayoutDashboard className="size-4 shrink-0" />

              {renamingId === d.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(d.id); if (e.key === 'Escape') setRenamingId(null); }}
                  onBlur={() => saveRename(d.id)}
                  className="h-6 text-xs px-1 flex-1"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="text-xs truncate flex-1 font-medium">{d.name}</span>
              )}

              <Badge variant="outline" className="text-[9px] shrink-0">{d.widgetCount}</Badge>

              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="size-5" onClick={e => { e.stopPropagation(); setRenamingId(d.id); setRenameValue(d.name); }}>
                  <PencilLine className="size-2.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-5 hover:text-destructive" onClick={e => { e.stopPropagation(); deleteDashboard(d.id); }}>
                  <Trash2 className="size-2.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
            <BarChart2 className="size-16 mx-auto mb-4 opacity-10" />
            <h3 className="text-lg font-semibold mb-1">No Dashboard Selected</h3>
            <p className="text-sm">Create or select a dashboard from the left panel to get started.</p>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin size-8 text-accent" />
          </div>
        ) : (
          <div className="p-6">
            {/* Dashboard header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">{selected.name}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.widgets.length} chart{selected.widgets.length !== 1 ? 's' : ''}</p>
              </div>
              <Button onClick={openWizard} className="gap-2">
                <Sparkles className="size-4" /> Add Chart
              </Button>
            </div>

            {/* Widget grid */}
            {selected.widgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                <Sparkles className="size-10 mb-4 opacity-20" />
                <p className="text-sm font-medium">No charts yet</p>
                <p className="text-xs mt-1">Click "Add Chart" to create your first AI-generated visualization</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {selected.widgets.map(widget => (
                  <Card
                    key={widget.id}
                    className={`glass-panel border-border/40 overflow-hidden ${widget.gridW === 2 ? 'lg:col-span-2' : ''}`}
                  >
                    <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{widget.title}</CardTitle>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{widget.dataSourceName}</p>
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <Badge variant="outline" className="text-[9px] font-mono">{widget.chartType}</Badge>
                        {widget.dataSourceType === 'database' && widget.dataQuery && (
                          <Button size="icon" variant="ghost" className="size-7" title="Refresh data" onClick={() => refreshWidget(widget)}>
                            <RefreshCw className="size-3" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={() => deleteWidget(widget.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <ChartRenderer config={widget.chartConfig} height={240} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Add Chart Wizard ─────────────────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={v => { if (!v) setWizardOpen(false); }}>
        <DialogContent className="glass-panel border-accent/20 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-accent" />
              Add Chart — {STEPS[step]}
            </DialogTitle>
            <DialogDescription>
              Step {step + 1} of {STEPS.length}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex gap-1 mb-2">
            {STEPS.map((s, i) => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-border'}`} />
            ))}
          </div>

          {/* ── Step 0: Choose source type ─── */}
          {step === 0 && (
            <div className="grid grid-cols-2 gap-3 py-4">
              {(['database', 'file'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setSourceType(type)}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${sourceType === type ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'}`}
                >
                  {type === 'database' ? <Database className="size-7 mb-2 text-accent" /> : <FolderOpen className="size-7 mb-2 text-accent" />}
                  <p className="font-semibold text-sm">{type === 'database' ? 'Database' : 'Files'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {type === 'database' ? 'Query a connected database table' : 'Visualize an uploaded CSV or JSON file'}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 1: DB path ─── */}
          {step === 1 && sourceType === 'database' && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Database Connection</label>
                <Select value={selectedConn} onValueChange={v => { setSelectedConn(v); loadTables(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a connection…" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {connections.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">No database connections found. Add one in the Databases section.</p>
                )}
              </div>

              {selectedConn && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Table</label>
                  {tablesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="size-3.5 animate-spin" /> Loading tables…
                    </div>
                  ) : (
                    <Select value={selectedTable} onValueChange={v => { setSelectedTable(v); loadTableSchema(v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a table…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map(t => (
                          <SelectItem key={t} value={t}><Table className="size-3 inline mr-1" />{t}</SelectItem>
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

              {selectedTable && tableSchema.columns.length > 0 && (
                <div className="rounded-lg bg-black/20 border border-border/40 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Columns ({tableSchema.columns.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tableSchema.columns.map(c => (
                      <Badge key={c.name} variant="outline" className="text-[10px] font-mono">{c.name} <span className="text-muted-foreground ml-1">{c.type}</span></Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: File path ─── */}
          {step === 1 && sourceType === 'file' && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Folder</label>
                <Select value={selectedFolder} onValueChange={v => { setSelectedFolder(v); loadFolderFiles(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a folder…" />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {folders.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">No folders found. Upload files in the Databases section.</p>
                )}
              </div>

              {selectedFolder && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">File (CSV / JSON)</label>
                  {folderFilesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="size-3.5 animate-spin" /> Loading files…
                    </div>
                  ) : folderFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No CSV or JSON files in this folder.</p>
                  ) : (
                    <Select value={selectedFile} onValueChange={v => { setSelectedFile(v); loadFile(v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a file…" />
                      </SelectTrigger>
                      <SelectContent>
                        {folderFiles.map((f: any) => (
                          <SelectItem key={f.id} value={f.id}><FileText className="size-3 inline mr-1" />{f.name}</SelectItem>
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
                <div className="rounded-lg bg-black/20 border border-border/40 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Columns ({fileSchema.columns.length}) · {fileSchema.rows.length} rows
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fileSchema.columns.map(c => (
                      <Badge key={c.name} variant="outline" className="text-[10px] font-mono">{c.name} <span className="text-muted-foreground ml-1">{c.type}</span></Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Prompt ─── */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-black/20 border border-border/40 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Data source</p>
                <p className="text-xs font-medium">
                  {sourceType === 'database' ? `${connections.find(c => c.id === selectedConn)?.name} → ${selectedTable}` : folderFiles.find(f => f.id === selectedFile)?.name}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Describe the chart you want</label>
                <Textarea
                  autoFocus
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Show me sales by region as a bar chart, or Monthly revenue trend over time"
                  className="resize-none text-sm"
                  rows={4}
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">Be specific about the columns you want to use and how to aggregate them.</p>
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ─── */}
          {step === 3 && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Chart Title</label>
                <Input value={previewTitle} onChange={e => setPreviewTitle(e.target.value)} className="text-sm" />
              </div>
              {preview && (
                <div className="rounded-xl border border-border/40 bg-black/20 p-4">
                  <ChartRenderer config={{ ...preview, title: previewTitle }} height={260} />
                </div>
              )}
              {preview && (
                <div className="text-[10px] text-muted-foreground flex gap-3">
                  <span>Type: <strong>{preview.chartType}</strong></span>
                  <span>Rows: <strong>{preview.data?.length ?? 0}</strong></span>
                  {preview.sql && <span className="truncate max-w-xs font-mono">SQL: {preview.sql.slice(0, 60)}…</span>}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-row justify-between">
            <Button variant="ghost" onClick={() => step > 0 ? setStep(s => s - 1) : setWizardOpen(false)}>
              {step === 0 ? 'Cancel' : '← Back'}
            </Button>
            <div className="flex gap-2">
              {step < 2 && (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                  Next <ChevronRight className="size-4 ml-1" />
                </Button>
              )}
              {step === 2 && (
                <Button onClick={runGenerate} disabled={!canProceed() || generating}>
                  {generating ? <><Loader2 className="size-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="size-4 mr-1" /> Generate Chart</>}
                </Button>
              )}
              {step === 3 && (
                <Button onClick={saveWidget} disabled={saving || !preview}>
                  {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Saving…</> : 'Save to Dashboard'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
