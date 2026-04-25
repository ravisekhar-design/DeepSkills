"use client";

/**
 * LAYER: Frontend — Semantic Model Editor
 * Edit field roles (dimension/measure), default aggregations, calculated fields, hierarchies.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Save, Hash, Type as TypeIcon, Calendar, ToggleLeft,
  Plus, Trash2, Sparkles, Box, Calculator, RefreshCw, ChevronRight,
  Edit3, Check, X, Layers, Database, FileText, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { semanticClientService } from "@/services/semantic.service";
import type {
  SemanticModel, FieldDef, CalcField, AggFunc, DataType, FieldRole,
} from "@/lib/semantic/types";

const AGG_OPTIONS: AggFunc[] = ["sum", "avg", "count", "count_distinct", "min", "max", "none"];

function fieldIcon(t: DataType) {
  if (t === "number") return Hash;
  if (t === "date") return Calendar;
  if (t === "boolean") return ToggleLeft;
  return TypeIcon;
}

export default function ModelEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const [model, setModel] = useState<SemanticModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [redetecting, setRedetecting] = useState(false);
  const [tab, setTab] = useState<"fields" | "calculations" | "hierarchies">("fields");
  const [calcDialogOpen, setCalcDialogOpen] = useState(false);
  const [editingCalc, setEditingCalc] = useState<CalcField | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await semanticClientService.getById(id);
      setModel(m);
    } catch {
      toast({ title: "Failed to load model", variant: "destructive" });
    }
    setLoading(false);
  }, [id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!model) return;
    setSaving(true);
    try {
      await semanticClientService.update(model.id, {
        name: model.name,
        description: model.description,
        fields: model.fields,
        calculations: model.calculations,
        hierarchies: model.hierarchies,
      });
      toast({ title: "Model saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const redetect = async () => {
    if (!model) return;
    setRedetecting(true);
    try {
      const fields = await semanticClientService.autoDetect({
        sourceType: model.sourceType, sourceId: model.sourceId,
        sourceTable: model.sourceTable, sourceSql: model.sourceSql,
      });
      // Merge: keep user customizations for fields that still exist
      const merged = fields.map(f => {
        const existing = model.fields.find(e => e.name === f.name);
        return existing ? { ...f, displayName: existing.displayName, role: existing.role, defaultAgg: existing.defaultAgg, format: existing.format, hidden: existing.hidden } : f;
      });
      setModel({ ...model, fields: merged });
      toast({ title: "Schema re-detected", description: `${fields.length} fields` });
    } catch {
      toast({ title: "Re-detect failed", variant: "destructive" });
    }
    setRedetecting(false);
  };

  const updateField = (name: string, updates: Partial<FieldDef>) => {
    if (!model) return;
    setModel({ ...model, fields: model.fields.map(f => f.name === name ? { ...f, ...updates } : f) });
  };

  const removeField = (name: string) => {
    if (!model) return;
    setModel({ ...model, fields: model.fields.filter(f => f.name !== name) });
  };

  const saveCalc = (calc: CalcField) => {
    if (!model) return;
    const exists = model.calculations.some(c => c.id === calc.id);
    setModel({
      ...model,
      calculations: exists ? model.calculations.map(c => c.id === calc.id ? calc : c) : [...model.calculations, calc],
    });
    setCalcDialogOpen(false);
    setEditingCalc(null);
  };

  const removeCalc = (id: string) => {
    if (!model) return;
    setModel({ ...model, calculations: model.calculations.filter(c => c.id !== id) });
  };

  if (loading) return <div className="h-[100dvh] flex items-center justify-center"><Loader2 className="size-6 animate-spin text-accent" /></div>;
  if (!model) return <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">Model not found</div>;

  const dimensions = model.fields.filter(f => f.role === "dimension");
  const measures = model.fields.filter(f => f.role === "measure");
  const SrcIcon = model.sourceType === "database" ? Database : model.sourceType === "prepared_dataset" ? Layers : FileText;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex items-center gap-3 bg-background/80 backdrop-blur shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/visualize")}>
          <ArrowLeft className="size-4" />
        </Button>
        <Box className="size-4 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <Input
            value={model.name}
            onChange={e => setModel({ ...model, name: e.target.value })}
            className="h-7 text-base font-semibold border-0 px-1 max-w-md focus-visible:ring-1"
          />
          <div className="flex items-center gap-2 mt-0.5">
            <SrcIcon className="size-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground truncate">{model.sourceName}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={redetect} disabled={redetecting}>
          {redetecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Re-detect
        </Button>
        <Link href={`/visualize/worksheets/new?modelId=${model.id}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <BarChart2 className="size-3.5" /> Build Chart
          </Button>
        </Link>
        <Button size="sm" className="gap-1.5" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border px-6 pt-2 shrink-0">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="fields" className="text-xs gap-1.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
              Fields <Badge variant="outline" className="ml-1 h-4 text-[9px]">{model.fields.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="calculations" className="text-xs gap-1.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
              Calculations <Badge variant="outline" className="ml-1 h-4 text-[9px]">{model.calculations.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="hierarchies" className="text-xs gap-1.5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
              Hierarchies <Badge variant="outline" className="ml-1 h-4 text-[9px]">{model.hierarchies.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Fields tab */}
        <TabsContent value="fields" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FieldList title="Dimensions" subtitle="Categorical fields used to group and filter data" fields={dimensions} onChange={updateField} onRemove={removeField} colorClass="text-green-400" />
              <FieldList title="Measures" subtitle="Numeric fields that get aggregated (sum, avg, count…)" fields={measures} onChange={updateField} onRemove={removeField} colorClass="text-blue-400" />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Calculations tab */}
        <TabsContent value="calculations" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-6 max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator className="size-4 text-accent" /> Calculated Fields</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Define new fields with simple math expressions.</p>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => { setEditingCalc(null); setCalcDialogOpen(true); }}>
                  <Plus className="size-3.5" /> New Calculation
                </Button>
              </div>
              {model.calculations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-12 text-center">No calculations yet. Click <strong>New Calculation</strong> above.</p>
              ) : (
                <div className="space-y-2">
                  {model.calculations.map(c => (
                    <div key={c.id} className="rounded-xl border border-border p-3 flex items-center gap-3 group hover:border-accent/30">
                      <Calculator className="size-4 text-accent shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{c.displayName}</p>
                        <code className="text-[11px] text-muted-foreground font-mono">{c.expression}</code>
                      </div>
                      <Badge variant="outline" className="text-[9px]">{c.role}</Badge>
                      <Badge variant="outline" className="text-[9px]">{c.dataType}</Badge>
                      <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100" onClick={() => { setEditingCalc(c); setCalcDialogOpen(true); }}>
                        <Edit3 className="size-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={() => removeCalc(c.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Hierarchies tab */}
        <TabsContent value="hierarchies" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-6 max-w-3xl">
              <p className="text-xs text-muted-foreground">
                Hierarchies (e.g. Country → State → City) — coming soon. For now, sort dimensions in the order you want to drill down.
              </p>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <CalcDialog
        open={calcDialogOpen}
        onClose={() => { setCalcDialogOpen(false); setEditingCalc(null); }}
        existing={editingCalc}
        onSave={saveCalc}
      />
    </div>
  );
}

// ── Field List ────────────────────────────────────────────────────────────────

function FieldList({
  title, subtitle, fields, onChange, onRemove, colorClass,
}: {
  title: string;
  subtitle: string;
  fields: FieldDef[];
  onChange: (name: string, updates: Partial<FieldDef>) => void;
  onRemove: (name: string) => void;
  colorClass: string;
}) {
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (f: FieldDef) => { setRenamingName(f.name); setRenameValue(f.displayName); };
  const saveRename = (name: string) => {
    if (renameValue.trim()) onChange(name, { displayName: renameValue.trim() });
    setRenamingName(null);
  };

  return (
    <div>
      <h3 className={`text-sm font-semibold mb-1 flex items-center gap-2 ${colorClass}`}>
        <span className="font-mono">{fields.length}</span> {title}
      </h3>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None — adjust roles below or re-detect schema.</p>
      ) : (
        <div className="space-y-1.5">
          {fields.map(f => {
            const Icon = fieldIcon(f.dataType);
            return (
              <div key={f.name} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:border-accent/30 transition-colors group">
                <Icon className={`size-3.5 shrink-0 ${colorClass}`} />
                {renamingName === f.name ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => saveRename(f.name)}
                    onKeyDown={e => { if (e.key === "Enter") saveRename(f.name); if (e.key === "Escape") setRenamingName(null); }}
                    className="h-6 text-xs flex-1"
                  />
                ) : (
                  <button onClick={() => startRename(f)} className="flex-1 text-left text-xs font-semibold truncate hover:text-accent" title="Click to rename">
                    {f.displayName}
                  </button>
                )}
                <code className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">{f.name}</code>
                {f.role === "measure" && (
                  <Select value={f.defaultAgg ?? "sum"} onValueChange={v => onChange(f.name, { defaultAgg: v as AggFunc })}>
                    <SelectTrigger className="h-6 w-20 text-[10px] font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGG_OPTIONS.map(a => <SelectItem key={a} value={a} className="text-[10px]">{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Select value={f.role} onValueChange={v => onChange(f.name, { role: v as FieldRole, defaultAgg: v === "measure" ? (f.defaultAgg ?? "sum") : undefined })}>
                  <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dimension" className="text-[10px]">dimension</SelectItem>
                    <SelectItem value="measure" className="text-[10px]">measure</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="size-6 opacity-0 group-hover:opacity-100 hover:text-destructive" onClick={() => onRemove(f.name)}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calc Dialog ───────────────────────────────────────────────────────────────

function CalcDialog({
  open, onClose, existing, onSave,
}: {
  open: boolean;
  onClose: () => void;
  existing: CalcField | null;
  onSave: (calc: CalcField) => void;
}) {
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [role, setRole] = useState<FieldRole>("measure");
  const [dataType, setDataType] = useState<DataType>("number");

  useEffect(() => {
    if (existing) { setName(existing.displayName); setExpr(existing.expression); setRole(existing.role); setDataType(existing.dataType); }
    else { setName(""); setExpr(""); setRole("measure"); setDataType("number"); }
  }, [existing, open]);

  const submit = () => {
    if (!name.trim() || !expr.trim()) return;
    const internalName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    onSave({
      id: existing?.id || `calc_${Date.now()}`,
      name: internalName,
      displayName: name.trim(),
      expression: expr.trim(),
      role, dataType,
      defaultAgg: role === "measure" ? "sum" : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Calculation" : "New Calculation"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Display Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Profit Margin" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Expression</label>
            <Textarea
              value={expr}
              onChange={e => setExpr(e.target.value)}
              placeholder="e.g. (revenue - cost) / revenue"
              rows={3}
              className="font-mono text-xs resize-none"
            />
            <p className="text-[10px] text-muted-foreground">Refer to fields by their internal name. Supports + - * / ( )</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={role} onValueChange={v => setRole(v as FieldRole)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dimension" className="text-xs">Dimension</SelectItem>
                  <SelectItem value="measure" className="text-xs">Measure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data Type</label>
              <Select value={dataType} onValueChange={v => setDataType(v as DataType)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="number" className="text-xs">Number</SelectItem>
                  <SelectItem value="string" className="text-xs">String</SelectItem>
                  <SelectItem value="date" className="text-xs">Date</SelectItem>
                  <SelectItem value="boolean" className="text-xs">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!name.trim() || !expr.trim()}>{existing ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
