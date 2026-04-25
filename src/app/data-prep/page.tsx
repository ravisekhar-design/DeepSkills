"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Database, Plus, Trash2, Loader2, Play, Save, Eye, ChevronRight,
  GitMerge, Filter, Type, BarChart2, Layers, X, Check, RefreshCw,
  ArrowRight, Settings2, Hash, Shuffle, Merge, FolderOutput,
  PencilLine, Search, ChevronDown, AlertCircle, CheckCircle2, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { dataPrepClientService } from "@/services/data-prep.service";
import { databaseClientService } from "@/services/database.service";
import type {
  DataPrepFlow, PrepStep, StepType, StepConfig,
  ColumnSchema, FilterCondition, RenameOp, AggregationOp,
  JoinCondition, StepPreviewResult,
} from "@/lib/data-prep/types";
import type { DatabaseConnection } from "@/lib/store";

// ── Step meta ──────────────────────────────────────────────────────────────────

const STEP_META: Record<StepType, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  source:    { label: "Source",    color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30",   icon: Database },
  filter:    { label: "Filter",    color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: Filter },
  rename:    { label: "Transform", color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  icon: Type },
  aggregate: { label: "Aggregate", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", icon: BarChart2 },
  join:      { label: "Join",      color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30", icon: GitMerge },
  union:     { label: "Union",     color: "text-teal-400",   bg: "bg-teal-500/10",   border: "border-teal-500/30",   icon: Merge },
  output:    { label: "Output",    color: "text-accent",     bg: "bg-accent/10",     border: "border-accent/30",     icon: FolderOutput },
};

const ADD_STEP_OPTIONS: StepType[] = ["filter", "rename", "aggregate", "join", "union", "output"];

function defaultConfig(type: StepType): StepConfig {
  switch (type) {
    case "source":    return { type, sourceKind: "database", connectionId: "", connectionName: "", sql: "" };
    case "filter":    return { type, conditions: [] };
    case "rename":    return { type, operations: [] };
    case "aggregate": return { type, groupBy: [], aggregations: [] };
    case "join":      return { type, joinType: "inner", rightConnectionId: "", rightConnectionName: "", rightSql: "", conditions: [] };
    case "union":     return { type, rightConnectionId: "", rightConnectionName: "", rightSql: "", all: false };
    case "output":    return { type, name: "", description: "" };
  }
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Step description helper ───────────────────────────────────────────────────

function stepDesc(cfg: StepConfig): string {
  switch (cfg.type) {
    case "source":    return (cfg.sourceKind ?? "database") === "file"
      ? (cfg.fileName || "No file")
      : (cfg.connectionName || "No connection");
    case "filter":    return `${cfg.conditions.length} condition${cfg.conditions.length !== 1 ? "s" : ""}`;
    case "rename":    return `${cfg.operations.length} operation${cfg.operations.length !== 1 ? "s" : ""}`;
    case "aggregate": return cfg.groupBy.length ? `Group by ${cfg.groupBy.join(", ")}` : "No groups";
    case "join":      return `${cfg.joinType.toUpperCase()} JOIN`;
    case "union":     return cfg.all ? "UNION ALL" : "UNION";
    case "output":    return cfg.name || "Unnamed dataset";
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DataPrepPage() {
  const { user } = useUser();
  const { toast } = useToast();

  // ── Flows list ─────────────────────────────────────────────────────────────
  const [flows, setFlows] = useState<DataPrepFlow[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [activeFlow, setActiveFlow] = useState<DataPrepFlow | null>(null);
  const [steps, setSteps] = useState<PrepStep[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchFlow, setSearchFlow] = useState("");
  const [newFlowDialog, setNewFlowDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [renamingFlowId, setRenamingFlowId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  // ── Pipeline state ─────────────────────────────────────────────────────────
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [addStepAfter, setAddStepAfter] = useState<number | null>(null);

  // ── Preview state ──────────────────────────────────────────────────────────
  const [previewResult, setPreviewResult] = useState<StepPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [bottomTab, setBottomTab] = useState<"configure" | "preview">("configure");

  // ── Connections + Folders/Files ──────────────────────────────────────────
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string; fileCount: number }[]>([]);

  const selectedStep = steps.find(s => s.id === selectedStepId) ?? null;
  const selectedStepIndex = steps.findIndex(s => s.id === selectedStepId);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadFlows = useCallback(async () => {
    if (!user) return;
    setFlowsLoading(true);
    try {
      const data = await dataPrepClientService.getAllFlows();
      setFlows(data);
    } catch { toast({ title: "Failed to load flows", variant: "destructive" }); }
    setFlowsLoading(false);
  }, [user?.uid]); // eslint-disable-line

  useEffect(() => { loadFlows(); }, [loadFlows]);

  useEffect(() => {
    databaseClientService.getAll().then(setConnections).catch(() => {});
    fetch("/api/files?type=folders").then(r => r.json()).then(j => setFolders(j.data || [])).catch(() => {});
  }, []);

  // ── Select flow ────────────────────────────────────────────────────────────

  const selectFlow = (flow: DataPrepFlow) => {
    setActiveFlow(flow);
    setSteps(flow.steps);
    setIsDirty(false);
    setSelectedStepId(flow.steps[0]?.id ?? null);
    setPreviewResult(null);
    setBottomTab("configure");
  };

  // ── Step mutations ─────────────────────────────────────────────────────────

  const updateStep = (id: string, cfg: StepConfig) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, config: cfg } : s));
    setIsDirty(true);
  };

  const addStep = (type: StepType, afterIndex: number) => {
    const newStep: PrepStep = { id: uid(), config: defaultConfig(type) };
    setSteps(prev => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newStep);
      return next;
    });
    setSelectedStepId(newStep.id);
    setIsDirty(true);
    setAddStepAfter(null);
    setBottomTab("configure");
  };

  const removeStep = (id: string) => {
    setSteps(prev => {
      const next = prev.filter(s => s.id !== id);
      if (selectedStepId === id) setSelectedStepId(next[0]?.id ?? null);
      return next;
    });
    setIsDirty(true);
  };

  // ── Save flow ──────────────────────────────────────────────────────────────

  const saveFlow = async () => {
    if (!activeFlow) return;
    setSaving(true);
    try {
      await dataPrepClientService.updateFlow(activeFlow.id, { steps });
      setIsDirty(false);
      setFlows(prev => prev.map(f => f.id === activeFlow.id ? { ...f, steps } : f));
      toast({ title: "Flow saved" });
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
    setSaving(false);
  };

  // ── Preview step ───────────────────────────────────────────────────────────

  const previewStep = async () => {
    if (!activeFlow || !steps.length) return;
    if (isDirty) await saveFlow();
    setPreviewing(true);
    setBottomTab("preview");
    try {
      const result = await dataPrepClientService.previewFlow(
        activeFlow.id,
        selectedStepIndex >= 0 ? selectedStepIndex : undefined,
      );
      setPreviewResult(result);
    } catch { toast({ title: "Preview failed", variant: "destructive" }); }
    setPreviewing(false);
  };

  // ── Run flow ───────────────────────────────────────────────────────────────

  const runFlow = async () => {
    if (!activeFlow) return;
    const hasOutput = steps.some(s => s.config.type === "output" && (s.config as any).name?.trim());
    if (!hasOutput) {
      toast({ title: "Add an Output step with a name first", variant: "destructive" });
      return;
    }
    if (isDirty) await saveFlow();
    setRunning(true);
    try {
      const dataset = await dataPrepClientService.runFlow(activeFlow.id);
      toast({ title: `Dataset "${dataset.name}" ready — ${dataset.rowCount.toLocaleString()} rows` });
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message, variant: "destructive" });
    }
    setRunning(false);
  };

  // ── Create flow ────────────────────────────────────────────────────────────

  const createFlow = async () => {
    if (!newFlowName.trim()) return;
    setCreatingFlow(true);
    try {
      const flow = await dataPrepClientService.createFlow(newFlowName.trim(), newFlowDesc.trim() || undefined);
      // Auto-add a Source step
      const sourceStep: PrepStep = { id: uid(), config: defaultConfig("source") };
      await dataPrepClientService.updateFlow(flow.id, { steps: [sourceStep] });
      const withSteps = { ...flow, steps: [sourceStep] };
      setFlows(prev => [withSteps, ...prev]);
      setNewFlowName(""); setNewFlowDesc(""); setNewFlowDialog(false);
      selectFlow(withSteps);
    } catch { toast({ title: "Failed to create flow", variant: "destructive" }); }
    setCreatingFlow(false);
  };

  const deleteFlow = async (id: string) => {
    await dataPrepClientService.deleteFlow(id).catch(() => {});
    setFlows(prev => prev.filter(f => f.id !== id));
    if (activeFlow?.id === id) { setActiveFlow(null); setSteps([]); }
  };

  const saveRename = async (id: string) => {
    if (!renameVal.trim()) { setRenamingFlowId(null); return; }
    await dataPrepClientService.updateFlow(id, { name: renameVal.trim() }).catch(() => {});
    setFlows(prev => prev.map(f => f.id === id ? { ...f, name: renameVal.trim() } : f));
    if (activeFlow?.id === id) setActiveFlow(prev => prev ? { ...prev, name: renameVal.trim() } : prev);
    setRenamingFlowId(null);
  };

  const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(searchFlow.toLowerCase()));

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-background">

      {/* ── Left sidebar ── */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border bg-sidebar">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Flows</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setNewFlowDialog(true)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchFlow}
              onChange={e => setSearchFlow(e.target.value)}
              placeholder="Search flows…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {flowsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredFlows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No flows yet</p>
            ) : filteredFlows.map(flow => (
              <div
                key={flow.id}
                className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                  activeFlow?.id === flow.id
                    ? "bg-accent/15 text-foreground"
                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => selectFlow(flow)}
              >
                {renamingFlowId === flow.id ? (
                  <Input
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveRename(flow.id); if (e.key === "Escape") setRenamingFlowId(null); }}
                    autoFocus
                    className="h-6 text-xs flex-1"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <Layers className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="flex-1 text-xs font-medium truncate">{flow.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{flow.steps.length}s</span>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        className="p-0.5 hover:text-foreground"
                        onClick={e => { e.stopPropagation(); setRenamingFlowId(flow.id); setRenameVal(flow.name); }}
                      >
                        <PencilLine className="h-3 w-3" />
                      </button>
                      <button
                        className="p-0.5 hover:text-destructive"
                        onClick={e => { e.stopPropagation(); deleteFlow(flow.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border">
          <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={() => setNewFlowDialog(true)}>
            <Plus className="h-3.5 w-3.5" /> New Flow
          </Button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!activeFlow ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="p-4 rounded-2xl bg-muted/30 border border-border">
              <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No flow selected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Select a flow from the sidebar or create a new one
              </p>
            </div>
            <Button onClick={() => setNewFlowDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Flow
            </Button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background/80 backdrop-blur shrink-0">
              <div className="flex-1 flex items-center gap-2">
                <Layers className="h-4 w-4 text-accent" />
                <span className="font-semibold text-sm">{activeFlow.name}</span>
                {isDirty && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-orange-400 border-orange-400/40">Unsaved</Badge>}
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={previewStep} disabled={previewing || !steps.length}>
                {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Preview
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={saveFlow} disabled={saving || !isDirty}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button size="sm" className="gap-1.5 h-7 text-xs gradient-sapphire text-white" onClick={runFlow} disabled={running}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Run Flow
              </Button>
            </div>

            {/* Pipeline canvas */}
            <div className="px-4 py-4 border-b border-border bg-muted/5 shrink-0 overflow-x-auto">
              <div className="flex items-center gap-0 min-w-max">
                {steps.length === 0 ? (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">No steps yet —</p>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => addStep("source", -1)}>
                      <Plus className="h-3.5 w-3.5" /> Add Source
                    </Button>
                  </div>
                ) : steps.map((step, idx) => {
                  const meta = STEP_META[step.config.type];
                  const Icon = meta.icon;
                  const isSelected = step.id === selectedStepId;
                  return (
                    <div key={step.id} className="flex items-center">
                      {/* Step card */}
                      <div
                        className={`relative group flex flex-col gap-1 px-3 py-2.5 rounded-xl border cursor-pointer transition-all w-36 ${meta.bg} ${meta.border} ${
                          isSelected ? "ring-2 ring-accent/50 shadow-md" : "hover:ring-1 hover:ring-border"
                        }`}
                        onClick={() => { setSelectedStepId(step.id); setBottomTab("configure"); }}
                      >
                        <div className="flex items-center justify-between">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                          <button
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-opacity"
                            onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <p className={`text-[11px] font-semibold leading-tight ${meta.color}`}>{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight truncate">{stepDesc(step.config)}</p>
                        <span className="absolute -top-2 -left-2 text-[9px] text-muted-foreground bg-background border border-border rounded-full w-4 h-4 flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Arrow + add button */}
                      {idx < steps.length - 1 && (
                        <div className="flex items-center mx-1 relative group/add">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="absolute left-1/2 -translate-x-1/2 hidden group-hover/add:block z-10">
                            <AddStepMenu onAdd={type => addStep(type, idx)} />
                          </div>
                        </div>
                      )}

                      {/* Add after last step */}
                      {idx === steps.length - 1 && (
                        <div className="flex items-center ml-2 relative group/add">
                          <div className="hidden group-hover/add:block absolute left-0 z-10">
                            <AddStepMenu onAdd={type => addStep(type, idx)} />
                          </div>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 rounded-full border-dashed"
                            onClick={() => setAddStepAfter(idx)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <Tabs value={bottomTab} onValueChange={v => setBottomTab(v as "configure" | "preview")} className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 pt-2 border-b border-border shrink-0">
                  <TabsList className="h-8">
                    <TabsTrigger value="configure" className="text-xs h-7 gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" /> Configure
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs h-7 gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Preview Data
                      {previewResult && (
                        <Badge className="ml-1 text-[10px] px-1.5 h-4">
                          {previewResult.rowCount.toLocaleString()}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="configure" className="flex-1 overflow-hidden m-0 p-4">
                  <ScrollArea className="h-full">
                    {!selectedStep ? (
                      <p className="text-sm text-muted-foreground">Select a step to configure it</p>
                    ) : (
                      <StepConfigurator
                        step={selectedStep}
                        connections={connections}
                        folders={folders}
                        onChange={cfg => updateStep(selectedStep.id, cfg)}
                      />
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="preview" className="flex-1 overflow-hidden m-0">
                  <DataPreviewPanel result={previewResult} loading={previewing} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>

      {/* Add step menu when clicking + on last step */}
      {addStepAfter !== null && (
        <Dialog open onOpenChange={() => setAddStepAfter(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-sm">Add Step</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {ADD_STEP_OPTIONS.map(type => {
                const meta = STEP_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${meta.border} ${meta.bg} hover:opacity-80 transition-opacity`}
                    onClick={() => { addStep(type, addStepAfter); }}
                  >
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New flow dialog */}
      <Dialog open={newFlowDialog} onOpenChange={setNewFlowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Preparation Flow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Flow name"
              value={newFlowName}
              onChange={e => setNewFlowName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createFlow(); }}
              autoFocus
            />
            <Textarea
              placeholder="Description (optional)"
              value={newFlowDesc}
              onChange={e => setNewFlowDesc(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setNewFlowDialog(false)}>Cancel</Button>
              <Button onClick={createFlow} disabled={!newFlowName.trim() || creatingFlow}>
                {creatingFlow ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Add Step Menu ─────────────────────────────────────────────────────────────

function AddStepMenu({ onAdd }: { onAdd: (type: StepType) => void }) {
  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl p-1.5 min-w-[140px]">
      {ADD_STEP_OPTIONS.map(type => {
        const meta = STEP_META[type];
        const Icon = meta.icon;
        return (
          <button
            key={type}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-muted text-left text-xs"
            onClick={() => onAdd(type)}
          >
            <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Step Configurator ─────────────────────────────────────────────────────────

function StepConfigurator({
  step,
  connections,
  folders,
  onChange,
}: {
  step: PrepStep;
  connections: DatabaseConnection[];
  folders: { id: string; name: string; fileCount: number }[];
  onChange: (cfg: StepConfig) => void;
}) {
  const cfg = step.config;

  if (cfg.type === "source") {
    const kind = cfg.sourceKind ?? "database";
    return (
      <div className="space-y-3 max-w-2xl">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Source Configuration</p>

        {/* Source kind tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onChange({ type: "source", sourceKind: "database", connectionId: "", connectionName: "", sql: "" })}
            className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-colors ${
              kind === "database" ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
            }`}
          >
            <Database className="size-4 text-accent shrink-0" />
            <div>
              <p className="text-xs font-semibold">Database</p>
              <p className="text-[10px] text-muted-foreground">Run a SQL query</p>
            </div>
          </button>
          <button
            onClick={() => onChange({ type: "source", sourceKind: "file", folderId: "", folderName: "", fileId: "", fileName: "" })}
            className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-colors ${
              kind === "file" ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
            }`}
          >
            <FolderOpen className="size-4 text-accent shrink-0" />
            <div>
              <p className="text-xs font-semibold">File</p>
              <p className="text-[10px] text-muted-foreground">CSV / JSON / TSV</p>
            </div>
          </button>
        </div>

        {kind === "database" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Connection</label>
              <Select
                value={cfg.connectionId || ""}
                onValueChange={v => {
                  const conn = connections.find(c => c.id === v);
                  onChange({ ...cfg, sourceKind: "database", connectionId: v, connectionName: conn?.name ?? v });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select database connection…" />
                </SelectTrigger>
                <SelectContent>
                  {connections.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No connections — add one in Databases.</div>
                  ) : connections.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">SQL Query</label>
              <Textarea
                value={cfg.sql || ""}
                onChange={e => onChange({ ...cfg, sql: e.target.value })}
                placeholder="SELECT * FROM orders LIMIT 5000"
                rows={6}
                className="font-mono text-xs resize-none"
              />
              <p className="text-[10px] text-muted-foreground">Max 5,000 rows fetched for in-memory transforms</p>
            </div>
          </>
        )}

        {kind === "file" && (
          <FileSourcePicker cfg={cfg} folders={folders} onChange={onChange} />
        )}
      </div>
    );
  }

  if (cfg.type === "filter") {
    return (
      <div className="space-y-3 max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Filter Conditions</p>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
            const newCond: FilterCondition = { id: uid(), column: "", operator: "=", value: "", logicOp: "AND" };
            onChange({ ...cfg, conditions: [...cfg.conditions, newCond] });
          }}>
            <Plus className="h-3.5 w-3.5" /> Add Condition
          </Button>
        </div>
        {cfg.conditions.length === 0 && (
          <p className="text-xs text-muted-foreground">No conditions — all rows pass through</p>
        )}
        <div className="space-y-2">
          {cfg.conditions.map((cond, idx) => (
            <div key={cond.id} className="flex items-center gap-2">
              {idx > 0 && (
                <Select value={cond.logicOp} onValueChange={v => {
                  const next = cfg.conditions.map(c => c.id === cond.id ? { ...c, logicOp: v as "AND" | "OR" } : c);
                  onChange({ ...cfg, conditions: next });
                }}>
                  <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND" className="text-xs">AND</SelectItem>
                    <SelectItem value="OR" className="text-xs">OR</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {idx === 0 && <span className="text-xs text-muted-foreground w-16 text-center">WHERE</span>}
              <Input
                className="h-7 text-xs w-36"
                placeholder="column"
                value={cond.column}
                onChange={e => {
                  const next = cfg.conditions.map(c => c.id === cond.id ? { ...c, column: e.target.value } : c);
                  onChange({ ...cfg, conditions: next });
                }}
              />
              <Select value={cond.operator} onValueChange={v => {
                const next = cfg.conditions.map(c => c.id === cond.id ? { ...c, operator: v as FilterCondition["operator"] } : c);
                onChange({ ...cfg, conditions: next });
              }}>
                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["=","!=",">","<",">=","<=","contains","not_contains","is_null","is_not_null"] as const).map(op => (
                    <SelectItem key={op} value={op} className="text-xs">{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!["is_null","is_not_null"].includes(cond.operator) && (
                <Input
                  className="h-7 text-xs w-36"
                  placeholder="value"
                  value={cond.value}
                  onChange={e => {
                    const next = cfg.conditions.map(c => c.id === cond.id ? { ...c, value: e.target.value } : c);
                    onChange({ ...cfg, conditions: next });
                  }}
                />
              )}
              <button onClick={() => onChange({ ...cfg, conditions: cfg.conditions.filter(c => c.id !== cond.id) })}>
                <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cfg.type === "rename") {
    return (
      <div className="space-y-3 max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Column Operations</p>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
            const newOp: RenameOp = { column: "" };
            onChange({ ...cfg, operations: [...cfg.operations, newOp] });
          }}>
            <Plus className="h-3.5 w-3.5" /> Add Column
          </Button>
        </div>
        {cfg.operations.length === 0 && (
          <p className="text-xs text-muted-foreground">No operations defined — add columns to rename or change type</p>
        )}
        <div className="space-y-2">
          {cfg.operations.map((op, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Column</p>
                  <Input className="h-7 text-xs" placeholder="col_name" value={op.column}
                    onChange={e => {
                      const next = [...cfg.operations]; next[idx] = { ...op, column: e.target.value };
                      onChange({ ...cfg, operations: next });
                    }} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">New Name</p>
                  <Input className="h-7 text-xs" placeholder="(keep same)" value={op.newName ?? ""}
                    onChange={e => {
                      const next = [...cfg.operations]; next[idx] = { ...op, newName: e.target.value || undefined };
                      onChange({ ...cfg, operations: next });
                    }} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Cast Type</p>
                  <Select value={op.newType ?? ""} onValueChange={v => {
                    const next = [...cfg.operations]; next[idx] = { ...op, newType: (v || undefined) as RenameOp["newType"] };
                    onChange({ ...cfg, operations: next });
                  }}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="(no cast)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="" className="text-xs">(no cast)</SelectItem>
                      <SelectItem value="string" className="text-xs">string</SelectItem>
                      <SelectItem value="number" className="text-xs">number</SelectItem>
                      <SelectItem value="boolean" className="text-xs">boolean</SelectItem>
                      <SelectItem value="date" className="text-xs">date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <input type="checkbox" checked={op.remove ?? false}
                    onChange={e => {
                      const next = [...cfg.operations]; next[idx] = { ...op, remove: e.target.checked };
                      onChange({ ...cfg, operations: next });
                    }} />
                  Remove
                </label>
                <button onClick={() => onChange({ ...cfg, operations: cfg.operations.filter((_, i) => i !== idx) })}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cfg.type === "aggregate") {
    return (
      <div className="space-y-4 max-w-2xl">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Group By Columns</p>
          <div className="flex flex-wrap gap-2">
            {cfg.groupBy.map((g, i) => (
              <Badge key={i} variant="outline" className="gap-1.5">
                {g}
                <button onClick={() => onChange({ ...cfg, groupBy: cfg.groupBy.filter((_, j) => j !== i) })}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Input
              className="h-7 text-xs w-36"
              placeholder="+ column name"
              onKeyDown={e => {
                if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                  onChange({ ...cfg, groupBy: [...cfg.groupBy, (e.target as HTMLInputElement).value.trim()] });
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Aggregations</p>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
              const newAgg: AggregationOp = { id: uid(), column: "", func: "count", alias: "count" };
              onChange({ ...cfg, aggregations: [...cfg.aggregations, newAgg] });
            }}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div className="space-y-2">
            {cfg.aggregations.map((agg, idx) => (
              <div key={agg.id} className="flex items-center gap-2">
                <Input className="h-7 text-xs w-28" placeholder="column" value={agg.column}
                  onChange={e => {
                    const next = cfg.aggregations.map(a => a.id === agg.id ? { ...a, column: e.target.value } : a);
                    onChange({ ...cfg, aggregations: next });
                  }} />
                <Select value={agg.func} onValueChange={v => {
                  const next = cfg.aggregations.map(a => a.id === agg.id ? { ...a, func: v as AggregationOp["func"] } : a);
                  onChange({ ...cfg, aggregations: next });
                }}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["count","sum","avg","min","max","count_distinct"] as const).map(f => (
                      <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">AS</span>
                <Input className="h-7 text-xs w-28" placeholder="alias" value={agg.alias}
                  onChange={e => {
                    const next = cfg.aggregations.map(a => a.id === agg.id ? { ...a, alias: e.target.value } : a);
                    onChange({ ...cfg, aggregations: next });
                  }} />
                <button onClick={() => onChange({ ...cfg, aggregations: cfg.aggregations.filter(a => a.id !== agg.id) })}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (cfg.type === "join") {
    return (
      <div className="space-y-3 max-w-2xl">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Join Configuration</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Join Type</label>
            <Select value={cfg.joinType} onValueChange={v => onChange({ ...cfg, joinType: v as typeof cfg.joinType })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["inner","left","right","full"] as const).map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t.toUpperCase()} JOIN</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Right Connection</label>
            <Select value={cfg.rightConnectionId} onValueChange={v => {
              const conn = connections.find(c => c.id === v);
              onChange({ ...cfg, rightConnectionId: v, rightConnectionName: conn?.name ?? v });
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {connections.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Right SQL</label>
          <Textarea value={cfg.rightSql} onChange={e => onChange({ ...cfg, rightSql: e.target.value })}
            placeholder="SELECT * FROM lookup_table" rows={3} className="font-mono text-xs resize-none" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">Join Conditions</label>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
              const newC: JoinCondition = { id: uid(), leftCol: "", rightCol: "" };
              onChange({ ...cfg, conditions: [...cfg.conditions, newC] });
            }}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {cfg.conditions.map(cond => (
            <div key={cond.id} className="flex items-center gap-2 mb-2">
              <Input className="h-7 text-xs flex-1" placeholder="left.col" value={cond.leftCol}
                onChange={e => {
                  const next = cfg.conditions.map(c => c.id === cond.id ? { ...c, leftCol: e.target.value } : c);
                  onChange({ ...cfg, conditions: next });
                }} />
              <span className="text-xs text-muted-foreground">=</span>
              <Input className="h-7 text-xs flex-1" placeholder="right.col" value={cond.rightCol}
                onChange={e => {
                  const next = cfg.conditions.map(c => c.id === cond.id ? { ...c, rightCol: e.target.value } : c);
                  onChange({ ...cfg, conditions: next });
                }} />
              <button onClick={() => onChange({ ...cfg, conditions: cfg.conditions.filter(c => c.id !== cond.id) })}>
                <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cfg.type === "union") {
    return (
      <div className="space-y-3 max-w-2xl">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Union Configuration</p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Right Connection</label>
          <Select value={cfg.rightConnectionId} onValueChange={v => {
            const conn = connections.find(c => c.id === v);
            onChange({ ...cfg, rightConnectionId: v, rightConnectionName: conn?.name ?? v });
          }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select connection…" /></SelectTrigger>
            <SelectContent>
              {connections.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Right SQL</label>
          <Textarea value={cfg.rightSql} onChange={e => onChange({ ...cfg, rightSql: e.target.value })}
            placeholder="SELECT * FROM another_table" rows={3} className="font-mono text-xs resize-none" />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={cfg.all} onChange={e => onChange({ ...cfg, all: e.target.checked })} />
          <span className="font-mono">UNION ALL</span>
          <span className="text-muted-foreground">(keep duplicate rows)</span>
        </label>
      </div>
    );
  }

  if (cfg.type === "output") {
    return (
      <div className="space-y-3 max-w-md">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Output Dataset</p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Dataset Name</label>
          <Input value={cfg.name} onChange={e => onChange({ ...cfg, name: e.target.value })}
            placeholder="e.g. Monthly Sales Clean" className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Description</label>
          <Textarea value={cfg.description ?? ""} onChange={e => onChange({ ...cfg, description: e.target.value })}
            placeholder="What this dataset contains…" rows={2} className="text-xs resize-none" />
        </div>
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 border border-border">
          Click <strong>Run Flow</strong> in the toolbar to execute all steps and save this dataset for use in Visualize.
        </p>
      </div>
    );
  }

  return null;
}

// ── File Source Picker (folder → file) ────────────────────────────────────────

function FileSourcePicker({
  cfg,
  folders,
  onChange,
}: {
  cfg: any;
  folders: { id: string; name: string; fileCount: number }[];
  onChange: (cfg: StepConfig) => void;
}) {
  const [files, setFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  useEffect(() => {
    if (!cfg.folderId) { setFiles([]); return; }
    setFilesLoading(true);
    fetch(`/api/files?type=files&folderId=${cfg.folderId}`)
      .then(r => r.json())
      .then(j => setFiles((j.data || []).filter((f: any) => /\.(csv|json|tsv)$/i.test(f.name))))
      .catch(() => setFiles([]))
      .finally(() => setFilesLoading(false));
  }, [cfg.folderId]);

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Folder</label>
        <Select
          value={cfg.folderId || ""}
          onValueChange={v => {
            const f = folders.find(x => x.id === v);
            onChange({ ...cfg, sourceKind: "file", folderId: v, folderName: f?.name ?? "", fileId: "", fileName: "" });
          }}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select folder…" /></SelectTrigger>
          <SelectContent>
            {folders.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No folders — upload files in the Files section.</div>
            ) : folders.map(f => (
              <SelectItem key={f.id} value={f.id} className="text-xs">
                {f.name} <span className="text-muted-foreground ml-1">· {f.fileCount} files</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cfg.folderId && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">File (CSV / JSON / TSV)</label>
          {filesLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="size-3 animate-spin" /> Loading files…
            </div>
          ) : files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No CSV/JSON/TSV files in this folder.</p>
          ) : (
            <Select
              value={cfg.fileId || ""}
              onValueChange={v => {
                const f = files.find(x => x.id === v);
                onChange({ ...cfg, sourceKind: "file", fileId: v, fileName: f?.name ?? "" });
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select file…" /></SelectTrigger>
              <SelectContent>
                {files.map(f => (
                  <SelectItem key={f.id} value={f.id} className="text-xs">
                    <FolderOutput className="size-3 inline mr-1" /> {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">Max 5,000 rows parsed for in-memory transforms</p>
    </>
  );
}

// ── Data Preview Panel ────────────────────────────────────────────────────────

function DataPreviewPanel({ result, loading }: { result: StepPreviewResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Running transforms…</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Click Preview to see data at the selected step</p>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="flex items-center gap-3 m-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <p className="text-xs">{result.error}</p>
      </div>
    );
  }

  const cols = result.schema;
  const rows = result.rows.slice(0, 100);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <CheckCircle2 className="h-4 w-4 text-green-400" />
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{result.rowCount.toLocaleString()}</strong> rows ·{" "}
          <strong className="text-foreground">{cols.length}</strong> columns
          {rows.length < result.rowCount && ` · showing first ${rows.length}`}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="text-xs w-full border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              {cols.map(col => (
                <th key={col.name} className="text-left px-3 py-2 border-b border-border font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {col.type === "number" ? <Hash className="h-3 w-3 text-blue-400" /> : <Type className="h-3 w-3 text-green-400" />}
                    {col.name}
                    <span className="text-[10px] text-muted-foreground font-normal">({col.type})</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/50 hover:bg-muted/20">
                {cols.map(col => (
                  <td key={col.name} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[200px] truncate font-mono">
                    {row[col.name] === null || row[col.name] === undefined
                      ? <span className="italic text-muted-foreground/50">null</span>
                      : String(row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
