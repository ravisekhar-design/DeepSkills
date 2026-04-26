"use client";

/**
 * LAYER: Frontend — Visualize Hub
 * Tableau-style 3-tab landing: Models / Worksheets / Dashboards.
 * The single entry point that replaces the legacy monolithic visualize page.
 *
 * Workflow:
 *   Data Sources → Data Prep → Semantic Model → Worksheet → Dashboard
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart2, Plus, Trash2, Loader2, Database, Layers, FileText,
  LayoutDashboard, Search, ArrowRight,
  Sparkles, Hash, ChevronRight, Box, Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { semanticClientService } from "@/services/semantic.service";
import { worksheetClientService } from "@/services/worksheet.service";
import { dataPrepClientService } from "@/services/data-prep.service";
import { databaseClientService } from "@/services/database.service";
import type { SemanticModel, SemanticSourceType } from "@/lib/semantic/types";
import type { Worksheet } from "@/lib/worksheet/types";
import type { PreparedDataset } from "@/lib/data-prep/types";
import type { DatabaseConnection } from "@/lib/store";

// ── Dashboard type (existing system) ──────────────────────────────────────────

interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgetCount: number;
  updatedAt: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VisualizeHubPage() {
  const { user } = useUser();
  const { toast } = useToast();

  const [tab, setTab] = useState<"models" | "worksheets" | "dashboards">("models");
  const [search, setSearch] = useState("");

  const [models, setModels] = useState<SemanticModel[]>([]);
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);

  // Create-model dialog state
  const [createModelOpen, setCreateModelOpen] = useState(false);
  const [datasets, setDatasets] = useState<PreparedDataset[]>([]);
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string; fileCount: number }[]>([]);

  // Create-dashboard dialog state
  const [createDashOpen, setCreateDashOpen] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [newDashDesc, setNewDashDesc] = useState("");

  // Create-worksheet dialog state
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsModelId, setNewWsModelId] = useState("");

  // ── Load all entities ───────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [m, w, d] = await Promise.all([
        semanticClientService.getAll(),
        worksheetClientService.getAll(),
        fetch("/api/dashboards").then(r => r.json()).then(j => j.data || []),
      ]);
      setModels(m);
      setWorksheets(w);
      setDashboards(d);
    } catch {
      toast({ title: "Failed to load data", variant: "destructive" });
    }
    setLoading(false);
  }, [user?.uid]); // eslint-disable-line

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Auth guard ──────────────────────────────────────────────────────────────

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

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredModels = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const filteredWorksheets = worksheets.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));
  const filteredDashboards = dashboards.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  // ── Delete handlers ────────────────────────────────────────────────────────

  // ── Pin worksheet to dashboard ─────────────────────────────────────────────

  const pinWorksheetToDashboard = async (worksheetId: string, dashboardId: string) => {
    const ws = worksheets.find(w => w.id === worksheetId);
    if (!ws) return;
    try {
      // Execute the worksheet to get data
      const result = await worksheetClientService.execute(ws.id);
      const cfg = ws.config;
      const palette = ['#6366f1', '#22d3ee', '#a3e635', '#f59e0b', '#ef4444', '#8b5cf6'];
      const isHoriz = cfg.chartType === "horizontal_bar";
      const dimCols = isHoriz ? cfg.rows : cfg.columns;
      const measCols = isHoriz ? cfg.columns : cfg.rows;
      const series = measCols.filter(p => p.role === "measure").map((p, i) => ({
        dataKey: p.alias || `${p.aggregation ?? "sum"}_${p.fieldName}`,
        name: `${p.aggregation ?? "sum"}(${p.displayName})`,
        color: palette[i % palette.length],
      }));
      const chartConfig = {
        title: ws.name,
        chartType: cfg.chartType,
        xKey: dimCols[0]?.fieldName ?? "",
        series,
        data: result.rows ?? [],
        sql: null,
      };
      const res = await fetch(`/api/dashboards/${dashboardId}/widgets`, {
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
        const dash = dashboards.find(d => d.id === dashboardId);
        toast({ title: `"${ws.name}" pinned to "${dash?.name ?? "dashboard"}"` });
        setDashboards(prev => prev.map(d => d.id === dashboardId ? { ...d, widgetCount: d.widgetCount + 1 } : d));
      } else {
        const msg = typeof json.error === "string" ? json.error : json.error?.message ?? "Unknown error";
        toast({ title: "Failed to pin chart", description: msg, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Failed to pin chart", description: e?.message, variant: "destructive" });
    }
  };

  const deleteModel = async (id: string) => {
    if (!confirm("Delete this model? Charts using it will be unbound.")) return;
    await semanticClientService.delete(id).catch(() => {});
    setModels(prev => prev.filter(m => m.id !== id));
  };
  const deleteWorksheet = async (id: string) => {
    if (!confirm("Delete this chart?")) return;
    await worksheetClientService.delete(id).catch(() => {});
    setWorksheets(prev => prev.filter(w => w.id !== id));
  };
  const deleteDashboard = async (id: string) => {
    if (!confirm("Delete this dashboard?")) return;
    await fetch(`/api/dashboards/${id}`, { method: "DELETE" }).catch(() => {});
    setDashboards(prev => prev.filter(d => d.id !== id));
  };

  // ── Create dashboard ───────────────────────────────────────────────────────

  const createDashboard = async () => {
    if (!newDashName.trim()) return;
    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDashName.trim(), description: newDashDesc.trim() || undefined }),
    });
    const json = await res.json();
    if (json.data) {
      setDashboards(prev => [{ ...json.data, widgetCount: 0 }, ...prev]);
      setNewDashName(""); setNewDashDesc(""); setCreateDashOpen(false);
      toast({ title: "Dashboard created" });
      window.location.href = `/visualize/dashboards/${json.data.id}`;
    }
  };

  // ── Create worksheet ───────────────────────────────────────────────────────

  const createWorksheet = async () => {
    if (!newWsName.trim()) return;
    try {
      const ws = await worksheetClientService.create({
        name: newWsName.trim(),
        modelId: newWsModelId || undefined,
      });
      setWorksheets(prev => [ws, ...prev]);
      setNewWsName(""); setNewWsModelId(""); setCreateWsOpen(false);
      window.location.href = `/visualize/worksheets/${ws.id}`;
    } catch {
      toast({ title: "Failed to create chart", variant: "destructive" });
    }
  };

  // ── Open create model dialog (loads sources) ───────────────────────────────

  const openCreateModel = async () => {
    setCreateModelOpen(true);
    try {
      const [ds, conn, foldersRes] = await Promise.all([
        dataPrepClientService.getAllDatasets().catch(() => []),
        databaseClientService.getAll().catch(() => []),
        fetch("/api/files?type=folders").then(r => r.json()).then(j => j.data || []).catch(() => []),
      ]);
      setDatasets(ds);
      setConnections(conn);
      setFolders(foldersRes);
    } catch {}
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">

      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-background/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <BarChart2 className="size-5 text-accent" />
          <div>
            <h1 className="text-lg font-bold">Visualize</h1>
            <p className="text-[11px] text-muted-foreground">Build, explore and publish data products</p>
          </div>
        </div>

        {/* Workflow indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="px-2 py-1 rounded-full bg-muted/40">Sources</span>
          <ChevronRight className="size-3" />
          <span className="px-2 py-1 rounded-full bg-muted/40">Data Prep</span>
          <ChevronRight className="size-3" />
          <span className="px-2 py-1 rounded-full bg-accent/15 text-accent">Models</span>
          <ChevronRight className="size-3" />
          <span className="px-2 py-1 rounded-full bg-accent/15 text-accent">Charts</span>
          <ChevronRight className="size-3" />
          <span className="px-2 py-1 rounded-full bg-accent/15 text-accent">Dashboards</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6 pt-3 bg-background/80 backdrop-blur shrink-0">
          <div className="flex items-center justify-between gap-4">
            <TabsList className="bg-transparent p-0 h-auto gap-1">
              <TabsTrigger value="models" className="gap-1.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent rounded-md">
                <Box className="size-3.5" /> Models
                <Badge variant="outline" className="ml-1 h-4 text-[9px]">{models.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="worksheets" className="gap-1.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent rounded-md">
                <BarChart2 className="size-3.5" /> Charts
                <Badge variant="outline" className="ml-1 h-4 text-[9px]">{worksheets.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="dashboards" className="gap-1.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent rounded-md">
                <LayoutDashboard className="size-3.5" /> Dashboards
                <Badge variant="outline" className="ml-1 h-4 text-[9px]">{dashboards.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-8 w-56 text-xs" />
              </div>
              {tab === "models" && (
                <Button size="sm" className="gap-1.5" onClick={openCreateModel}>
                  <Plus className="size-3.5" /> New Model
                </Button>
              )}
              {tab === "worksheets" && (
                <Button size="sm" className="gap-1.5" onClick={() => setCreateWsOpen(true)}>
                  <Plus className="size-3.5" /> New Chart
                </Button>
              )}
              {tab === "dashboards" && (
                <Button size="sm" className="gap-1.5" onClick={() => setCreateDashOpen(true)}>
                  <Plus className="size-3.5" /> New Dashboard
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Models Tab */}
        <TabsContent value="models" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-6">
              {loading ? (
                <Loader2 className="size-6 animate-spin text-accent mx-auto mt-12" />
              ) : filteredModels.length === 0 ? (
                <EmptyState
                  icon={Box}
                  title="No semantic models yet"
                  desc="A model defines dimensions, measures, and calculations over a data source. Create one to start building charts."
                  cta="Create Model"
                  onCta={openCreateModel}
                  helpFlow="Sources / Data Prep → Model"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredModels.map(m => (
                    <ModelCard key={m.id} model={m} onDelete={() => deleteModel(m.id)} />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Worksheets Tab */}
        <TabsContent value="worksheets" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-6">
              {loading ? (
                <Loader2 className="size-6 animate-spin text-accent mx-auto mt-12" />
              ) : filteredWorksheets.length === 0 ? (
                <EmptyState
                  icon={BarChart2}
                  title="No charts yet"
                  desc="Build a chart by dragging fields from a semantic model onto Columns and Rows shelves — exactly like Tableau."
                  cta="Create Chart"
                  onCta={() => setCreateWsOpen(true)}
                  helpFlow="Model → Chart"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredWorksheets.map(w => (
                    <WorksheetCard
                      key={w.id}
                      worksheet={w}
                      modelName={models.find(m => m.id === w.modelId)?.name}
                      dashboards={dashboards}
                      onDelete={() => deleteWorksheet(w.id)}
                      onPinToDashboard={(dashId) => pinWorksheetToDashboard(w.id, dashId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Dashboards Tab */}
        <TabsContent value="dashboards" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-6">
              {loading ? (
                <Loader2 className="size-6 animate-spin text-accent mx-auto mt-12" />
              ) : filteredDashboards.length === 0 ? (
                <EmptyState
                  icon={LayoutDashboard}
                  title="No dashboards yet"
                  desc="Compose your saved charts into a dashboard with global filters and cross-chart actions."
                  cta="Create Dashboard"
                  onCta={() => setCreateDashOpen(true)}
                  helpFlow="Charts → Dashboard"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDashboards.map(d => (
                    <DashboardCard key={d.id} dashboard={d} onDelete={() => deleteDashboard(d.id)} />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* New Model Dialog */}
      <NewModelDialog
        open={createModelOpen}
        onClose={() => setCreateModelOpen(false)}
        datasets={datasets}
        connections={connections}
        folders={folders}
        onCreated={(m) => { setModels(prev => [m, ...prev]); window.location.href = `/visualize/models/${m.id}`; }}
      />

      {/* New Worksheet Dialog */}
      <Dialog open={createWsOpen} onOpenChange={setCreateWsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Chart</DialogTitle>
            <DialogDescription>Select a semantic model to build the chart from.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Chart name" value={newWsName} onChange={e => setNewWsName(e.target.value)} autoFocus />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Semantic Model</label>
              {models.length === 0 ? (
                <p className="text-xs text-muted-foreground">Create a model first to use it here.</p>
              ) : (
                <Select value={newWsModelId} onValueChange={setNewWsModelId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a model…" /></SelectTrigger>
                  <SelectContent>
                    {models.map(m => <SelectItem key={m.id} value={m.id} className="text-sm">{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setCreateWsOpen(false)}>Cancel</Button>
              <Button onClick={createWorksheet} disabled={!newWsName.trim() || !newWsModelId}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Dashboard Dialog */}
      <Dialog open={createDashOpen} onOpenChange={setCreateDashOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Dashboard</DialogTitle>
            <DialogDescription>Compose charts into a single interactive view.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Dashboard name" value={newDashName} onChange={e => setNewDashName(e.target.value)} autoFocus />
            <Textarea placeholder="Description (optional)" value={newDashDesc} onChange={e => setNewDashDesc(e.target.value)} rows={2} />
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setCreateDashOpen(false)}>Cancel</Button>
              <Button onClick={createDashboard} disabled={!newDashName.trim()}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon, title, desc, cta, onCta, helpFlow,
}: {
  icon: React.ElementType; title: string; desc: string; cta: string; onCta: () => void; helpFlow?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 max-w-md mx-auto text-center">
      <div className="p-4 rounded-2xl bg-muted/30 border border-border mb-4">
        <Icon className="size-10 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6">{desc}</p>
      <Button onClick={onCta} className="gap-1.5">
        <Plus className="size-4" /> {cta}
      </Button>
      {helpFlow && (
        <div className="mt-6 text-xs text-muted-foreground/80 flex items-center gap-1.5">
          <Sparkles className="size-3" /> Workflow: {helpFlow}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model, onDelete }: { model: SemanticModel; onDelete: () => void }) {
  const dimCount = model.fields.filter(f => f.role === "dimension").length + model.calculations.filter(c => c.role === "dimension").length;
  const measCount = model.fields.filter(f => f.role === "measure").length + model.calculations.filter(c => c.role === "measure").length;
  const sourceIcon = model.sourceType === "database" ? Database : model.sourceType === "prepared_dataset" ? Layers : FileText;
  const SrcIcon = sourceIcon;
  return (
    <Card className="group hover:border-accent/50 transition-colors">
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
        <Link href={`/visualize/models/${model.id}`} className="flex-1 min-w-0 mr-2">
          <CardTitle className="text-sm font-semibold truncate hover:text-accent transition-colors">
            {model.name}
          </CardTitle>
          {model.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>}
        </Link>
        <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="size-3" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <SrcIcon className="size-3" />
          <span className="truncate">{model.sourceName}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <Badge variant="outline" className="gap-1 font-mono"><Hash className="size-2.5 text-blue-400" /> {measCount}</Badge>
          <Badge variant="outline" className="gap-1 font-mono">Aa {dimCount}</Badge>
          {model.calculations.length > 0 && <Badge variant="outline" className="font-mono">+{model.calculations.length} calc</Badge>}
        </div>
        <Link href={`/visualize/models/${model.id}`} className="flex items-center justify-between pt-2 border-t border-border text-[11px] text-muted-foreground hover:text-accent">
          <span>Edit model</span><ArrowRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function WorksheetCard({
  worksheet, modelName, dashboards, onDelete, onPinToDashboard,
}: {
  worksheet: Worksheet;
  modelName?: string;
  dashboards: Dashboard[];
  onDelete: () => void;
  onPinToDashboard: (dashboardId: string) => void;
}) {
  return (
    <Card className="group hover:border-accent/50 transition-colors">
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
        <Link href={`/visualize/worksheets/${worksheet.id}`} className="flex-1 min-w-0 mr-2">
          <CardTitle className="text-sm font-semibold truncate hover:text-accent transition-colors">
            {worksheet.name}
          </CardTitle>
          <Badge variant="outline" className="text-[9px] font-mono mt-1">{worksheet.config.chartType}</Badge>
        </Link>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {dashboards.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7" title="Pin to Dashboard">
                  <Pin className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-[200px]">
                {dashboards.map(d => (
                  <DropdownMenuItem key={d.id} onClick={() => onPinToDashboard(d.id)} className="text-xs">
                    <LayoutDashboard className="size-3 mr-1.5 shrink-0" />
                    <span className="truncate">{d.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={onDelete}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Box className="size-3" />
          <span className="truncate">{modelName || "No model"}</span>
        </div>
        <Link href={`/visualize/worksheets/${worksheet.id}`} className="flex items-center justify-between pt-3 mt-2 border-t border-border text-[11px] text-muted-foreground hover:text-accent">
          <span>Edit chart</span><ArrowRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function DashboardCard({ dashboard, onDelete }: { dashboard: Dashboard; onDelete: () => void }) {
  return (
    <Card className="group hover:border-accent/50 transition-colors">
      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
        <Link href={`/visualize/dashboards/${dashboard.id}`} className="flex-1 min-w-0 mr-2">
          <CardTitle className="text-sm font-semibold truncate hover:text-accent transition-colors">
            {dashboard.name}
          </CardTitle>
          {dashboard.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{dashboard.description}</p>}
        </Link>
        <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="size-3" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <Badge variant="outline" className="text-[10px]">
          {dashboard.widgetCount} chart{dashboard.widgetCount !== 1 ? "s" : ""}
        </Badge>
        <Link href={`/visualize/dashboards/${dashboard.id}`} className="flex items-center justify-between pt-3 mt-2 border-t border-border text-[11px] text-muted-foreground hover:text-accent">
          <span>Open dashboard</span><ArrowRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

// ── New Model Dialog ──────────────────────────────────────────────────────────

function NewModelDialog({
  open, onClose, datasets, connections, folders, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  datasets: PreparedDataset[];
  connections: DatabaseConnection[];
  folders: { id: string; name: string; fileCount: number }[];
  onCreated: (m: SemanticModel) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [sourceType, setSourceType] = useState<SemanticSourceType>("prepared_dataset");
  const [sourceId, setSourceId] = useState("");
  const [sourceTable, setSourceTable] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (sourceType !== "database" || !sourceId) { setTables([]); return; }
    setTablesLoading(true);
    fetch(`/api/dashboards/schema?connectionId=${sourceId}`)
      .then(r => r.json())
      .then(j => setTables(j.data?.tables || []))
      .finally(() => setTablesLoading(false));
  }, [sourceType, sourceId]);

  useEffect(() => {
    if (sourceType !== "file" || !folderId) { setFiles([]); return; }
    setFilesLoading(true);
    fetch(`/api/files?type=files&folderId=${folderId}`)
      .then(r => r.json())
      .then(j => setFiles((j.data || []).filter((f: any) => /\.(csv|json|tsv)$/i.test(f.name))))
      .finally(() => setFilesLoading(false));
  }, [sourceType, folderId]);

  const reset = () => {
    setName(""); setDesc(""); setSourceType("prepared_dataset");
    setSourceId(""); setSourceTable(""); setTables([]);
    setFolderId(""); setFiles([]);
  };

  const create = async () => {
    if (!name.trim() || !sourceId) return;
    setCreating(true);
    try {
      let sourceName = "";
      if (sourceType === "database") {
        const conn = connections.find(c => c.id === sourceId);
        sourceName = `${conn?.name}${sourceTable ? ` / ${sourceTable}` : ""}`;
      } else if (sourceType === "prepared_dataset") {
        sourceName = datasets.find(d => d.id === sourceId)?.name || "";
      } else if (sourceType === "file") {
        const folder = folders.find(f => f.id === folderId);
        const file = files.find(f => f.id === sourceId);
        sourceName = `${folder?.name ?? ""} / ${file?.name ?? ""}`;
      }
      const model = await semanticClientService.create({
        name: name.trim(),
        description: desc.trim() || undefined,
        sourceType, sourceId, sourceName,
        sourceTable: sourceType === "database" ? sourceTable : undefined,
      });
      reset();
      onClose();
      onCreated(model);
    } catch (e: any) {
      toast({ title: "Failed to create model", description: e?.message, variant: "destructive" });
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Semantic Model</DialogTitle>
          <DialogDescription>
            Define a business-friendly view of your data. Fields will auto-detect into dimensions and measures.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales Pipeline" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Description (optional)</label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Source Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { setSourceType("prepared_dataset"); setSourceId(""); setFolderId(""); }}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${sourceType === "prepared_dataset" ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"}`}
              >
                <Layers className="size-4 mb-1 text-accent" />
                <p className="text-xs font-semibold">Dataset</p>
                <p className="text-[10px] text-muted-foreground">{datasets.length} available</p>
              </button>
              <button
                onClick={() => { setSourceType("database"); setSourceId(""); setFolderId(""); }}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${sourceType === "database" ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"}`}
              >
                <Database className="size-4 mb-1 text-accent" />
                <p className="text-xs font-semibold">Database</p>
                <p className="text-[10px] text-muted-foreground">{connections.length} conn.</p>
              </button>
              <button
                onClick={() => { setSourceType("file"); setSourceId(""); setFolderId(""); }}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${sourceType === "file" ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"}`}
              >
                <FileText className="size-4 mb-1 text-accent" />
                <p className="text-xs font-semibold">File</p>
                <p className="text-[10px] text-muted-foreground">{folders.length} folder{folders.length !== 1 ? "s" : ""}</p>
              </button>
            </div>
          </div>
          {sourceType === "prepared_dataset" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Dataset</label>
              {datasets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No datasets found. Create one in <Link href="/data-prep" className="text-accent underline">Data Prep</Link>.
                </p>
              ) : (
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select dataset…" /></SelectTrigger>
                  <SelectContent>
                    {datasets.map(d => (
                      <SelectItem key={d.id} value={d.id} className="text-sm">
                        {d.name} <span className="text-muted-foreground ml-1">· {d.rowCount.toLocaleString()} rows</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {sourceType === "database" && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Connection</label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select connection…" /></SelectTrigger>
                  <SelectContent>
                    {connections.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No connections — add one in Databases.</div>
                    ) : connections.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name} ({c.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {sourceId && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Table</label>
                  {tablesLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Select value={sourceTable} onValueChange={setSourceTable}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select table…" /></SelectTrigger>
                      <SelectContent>
                        {tables.map(t => <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </>
          )}
          {sourceType === "file" && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Folder</label>
                {folders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No folders — upload files in the Files section first.</p>
                ) : (
                  <Select value={folderId} onValueChange={v => { setFolderId(v); setSourceId(""); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select folder…" /></SelectTrigger>
                    <SelectContent>
                      {folders.map(f => (
                        <SelectItem key={f.id} value={f.id} className="text-sm">
                          {f.name} <span className="text-muted-foreground ml-1">· {f.fileCount} files</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {folderId && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">File (CSV / JSON / TSV)</label>
                  {filesLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : files.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No CSV/JSON/TSV files in this folder.</p>
                  ) : (
                    <Select value={sourceId} onValueChange={setSourceId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select file…" /></SelectTrigger>
                      <SelectContent>
                        {files.map(f => <SelectItem key={f.id} value={f.id} className="text-sm">{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button
              onClick={create}
              disabled={
                !name.trim() || !sourceId
                || (sourceType === "database" && !sourceTable)
                || (sourceType === "file" && !folderId)
                || creating
              }
            >
              {creating && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
