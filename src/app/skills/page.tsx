"use client";

import { useState, useMemo } from "react";
import { DEFAULT_SKILLS, Skill, SystemSettings } from "@/lib/store";
import { generateSkillCode, generateSkillManifest } from "@/lib/code-generator";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap, Search, Plus, Trash2, Settings2, BrainCircuit, LineChart,
  Beaker, Sparkles, Wand2, Loader2, Edit, Shield, Code2, Copy, Check, AlertCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { generateSkill } from "@/ai/flows/skill-generation";
import { useUser } from "@/hooks/use-user";
import { useSkills, useSaveSkill, useDeleteSkill } from "@/hooks/queries/use-skills";
import { useSettings } from "@/hooks/queries/use-settings";

// ── Category icon map ────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Finance:      LineChart,
  Utility:      Settings2,
  Analysis:     Search,
  Creative:     Sparkles,
  Logic:        Beaker,
  Intelligence: BrainCircuit,
};

// ── Skill Card Skeleton ──────────────────────────────────────────────────────

function SkillCardSkeleton() {
  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start mb-4">
          <Skeleton className="size-12 rounded-xl" />
          <Skeleton className="size-8 rounded" />
        </div>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-24 mt-1" />
        <Skeleton className="h-4 w-full mt-3" />
        <Skeleton className="h-4 w-3/4 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3 pt-4 border-t border-border/50">
          <Skeleton className="h-3 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t border-border/50">
        <Skeleton className="h-4 w-24" />
      </CardFooter>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const { user } = useUser();
  const { toast } = useToast();

  // ── Data layer — React Query ─────────────────────────────────────────────
  const { data: customSkills = [], isLoading: skillsLoading, isError: skillsError, refetch: refetchSkills } = useSkills();
  const { data: settings } = useSettings();
  const saveSkillMutation   = useSaveSkill();
  const deleteSkillMutation = useDeleteSkill();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]         = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isNewSkillOpen, setIsNewSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill]     = useState<Skill | null>(null);
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null);
  const [genLoading, setGenLoading]         = useState(false);
  const [seedIdea, setSeedIdea]             = useState("");

  const [newSkill, setNewSkill] = useState({
    name: "",
    description: "",
    category: "Utility" as Skill['category'],
    inputs: "",
  });

  // ── Code viewer/editor state ─────────────────────────────────────────────
  const [viewCodeSkill, setViewCodeSkill]     = useState<Skill | null>(null);
  const [codeViewTab, setCodeViewTab]         = useState<'manifest' | 'implementation'>('implementation');
  const [editableCode, setEditableCode]       = useState("");
  const [editableManifest, setEditableManifest] = useState('');
  const [codeCopied, setCodeCopied]           = useState(false);
  const [codeEditing, setCodeEditing]         = useState(false);
  const [manifestEditing, setManifestEditing] = useState(false);

  // ── Merged skill list (defaults + custom overrides) ──────────────────────
  const skills = useMemo(() => {
    const customMap      = new Map(customSkills.map(s => [s.id, s]));
    const mergedDefaults = DEFAULT_SKILLS.map(ds => customMap.has(ds.id) ? customMap.get(ds.id)! : ds);
    const pureCustom     = customSkills.filter(cs => !DEFAULT_SKILLS.some(ds => ds.id === cs.id));
    return [...mergedDefaults, ...pureCustom];
  }, [customSkills]);

  // ── AI skill synthesis ───────────────────────────────────────────────────
  const handleSynthesizeSkill = async () => {
    if (!seedIdea) {
      toast({ title: "Error", description: "Please provide a seed idea first.", variant: "destructive" });
      return;
    }
    setGenLoading(true);
    try {
      const result = await generateSkill({
        seed: seedIdea,
        preferredModel: settings?.modelMapping?.skillSynthesis
      });
      setNewSkill({
        name: result.name,
        description: result.description,
        category: result.category,
        inputs: result.inputs.join(", "),
      });
      toast({ title: "Module Synthesized", description: "AI has architected a professional capability module." });
    } catch {
      toast({ title: "Synthesis Failed", description: "Failed to connect to the cognitive engine.", variant: "destructive" });
    } finally {
      setGenLoading(false);
    }
  };

  // ── Toggle enabled state ─────────────────────────────────────────────────
  const toggleSkill = (skill: Skill) => {
    if (!user) return;
    const updated = { ...skill, enabled: !skill.enabled };
    saveSkillMutation.mutate(updated, {
      onSuccess: () => toast({
        title: updated.enabled ? "Skill Activated" : "Skill Deactivated",
        description: `${updated.name} has been ${updated.enabled ? 'enabled' : 'disabled'}.`
      }),
      onError: () => toast({ title: "Error", description: "Failed to update skill.", variant: "destructive" }),
    });
  };

  // ── Create / update skill ────────────────────────────────────────────────
  const handleCreateSkill = () => {
    if (!user || !newSkill.name || !newSkill.description) {
      toast({ title: "Error", description: "Parameters missing.", variant: "destructive" });
      return;
    }
    const skill: Skill = {
      id:          editingSkill ? editingSkill.id : Math.random().toString(36).substring(7),
      name:        newSkill.name,
      description: newSkill.description,
      category:    newSkill.category,
      inputs:      newSkill.inputs.split(",").map(i => i.trim()).filter(i => i),
      enabled:     editingSkill ? editingSkill.enabled : true,
      isCustom:    true,
      code:        editingSkill?.code,
    };
    saveSkillMutation.mutate(skill, {
      onSuccess: () => {
        setIsNewSkillOpen(false);
        resetForm();
        toast({
          title: editingSkill ? "Skill Updated" : "Skill Registered",
          description: `${skill.name} is now available in your Library.`
        });
      },
      onError: () => toast({ title: "Save Failed", description: "Could not persist skill.", variant: "destructive" }),
    });
  };

  const handleEditSkill = (skill: Skill) => {
    setEditingSkill(skill);
    setNewSkill({
      name:        skill.name,
      description: skill.description,
      category:    skill.category,
      inputs:      skill.inputs ? skill.inputs.join(", ") : "",
    });
    setIsNewSkillOpen(true);
  };

  const resetForm = () => {
    setEditingSkill(null);
    setNewSkill({ name: "", description: "", category: "Utility", inputs: "" });
    setSeedIdea("");
  };

  // ── Delete (with confirmation) ────────────────────────────────────────────
  const confirmDeleteSkill = () => {
    if (!deletingSkillId) return;
    deleteSkillMutation.mutate(deletingSkillId, {
      onSuccess: () => {
        setDeletingSkillId(null);
        toast({ title: "Skill Purged", description: "The module has been removed from your Library." });
      },
      onError: () => toast({ title: "Delete Failed", description: "Could not remove skill.", variant: "destructive" }),
    });
  };

  // ── Code viewer ───────────────────────────────────────────────────────────
  const openCodeViewer = (skill: Skill) => {
    setViewCodeSkill(skill);
    setEditableCode(generateSkillCode(skill));
    setEditableManifest(generateSkillManifest(skill));
    setCodeViewTab('implementation');
    setCodeEditing(false);
    setManifestEditing(false);
  };

  const handleSaveCode = () => {
    if (!viewCodeSkill) return;
    const updated = { ...viewCodeSkill, code: editableCode };
    saveSkillMutation.mutate(updated, {
      onSuccess: () => {
        setViewCodeSkill(updated);
        setCodeEditing(false);
        toast({ title: 'Code Saved', description: `${viewCodeSkill.name} implementation updated.` });
      },
    });
  };

  const handleSaveManifest = () => {
    if (!viewCodeSkill) return;
    const updated = { ...viewCodeSkill, manifest: editableManifest } as Skill;
    saveSkillMutation.mutate(updated, {
      onSuccess: () => {
        setViewCodeSkill(updated);
        setManifestEditing(false);
        toast({ title: 'SKILL.md Saved', description: `${viewCodeSkill.name} manifest updated.` });
      },
    });
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredSkills = skills.filter(s => {
    const matchesSearch   = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            s.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Finance", "Utility", "Analysis", "Creative", "Logic", "Intelligence"];

  if (!user) return null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <Badge variant="outline" className="border-accent/30 text-accent px-3 py-1 uppercase tracking-widest text-[10px] font-bold">
            Skill Library
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tighter">Cognitive Capabilities</h1>
          <p className="text-muted-foreground sm:text-lg max-w-2xl">
            A repository of integrated tools. Toggled modules are available to your agents.
          </p>
        </div>

        {/* ── Register / Edit Skill Dialog ──────────────────────────────── */}
        <Dialog open={isNewSkillOpen} onOpenChange={(open) => {
          setIsNewSkillOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="lg" className="gradient-copper shadow-xl shadow-accent/20 h-12 px-8">
              <Plus className="mr-2 size-5" /> Register Capability
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-accent/20 sm:max-w-xl max-h-[90vh] overflow-y-auto" aria-label={editingSkill ? "Edit Module Configuration" : "Register New Module"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-accent" />
                {editingSkill ? "Edit Module Configuration" : "Register New Module"}
              </DialogTitle>
              <DialogDescription>
                Add a custom skill or use AI to synthesize a professional capability definition.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6 border-b border-border/50">
              <div className="grid gap-3 p-4 rounded-xl bg-accent/5 border border-accent/10">
                <Label className="text-accent font-bold tracking-widest uppercase text-[10px]">Cognitive Seed (AI Designer)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="E.g. Real-time News Sentiment Monitor"
                    className="bg-secondary/50 border-accent/10 focus:border-accent/40 h-11"
                    value={seedIdea}
                    onChange={(e) => setSeedIdea(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSynthesizeSkill()}
                    aria-label="Seed idea for AI skill generation"
                  />
                  <Button
                    onClick={handleSynthesizeSkill}
                    disabled={genLoading}
                    variant="secondary"
                    className="border border-accent/20 hover:bg-accent/10 h-11 px-6"
                    aria-label="Synthesize skill with AI"
                  >
                    {genLoading ? <Loader2 className="animate-spin size-4" /> : <Wand2 className="size-4 mr-2" />}
                    Synthesize
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="skill-name" className="text-[10px] uppercase tracking-widest font-bold">Skill Name</Label>
                  <Input
                    id="skill-name"
                    placeholder="e.g. Data Synthesizer"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="skill-category" className="text-[10px] uppercase tracking-widest font-bold">Domain</Label>
                  <Select value={newSkill.category} onValueChange={(v: any) => setNewSkill({ ...newSkill, category: v })}>
                    <SelectTrigger id="skill-category">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c !== "All").map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="skill-desc" className="text-[10px] uppercase tracking-widest font-bold">Capability Description</Label>
                <Textarea
                  id="skill-desc"
                  placeholder="Define the functional scope of this module..."
                  className="min-h-[100px] leading-relaxed"
                  value={newSkill.description}
                  onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="skill-inputs" className="text-[10px] uppercase tracking-widest font-bold">Required Parameters (comma-separated)</Label>
                <Input
                  id="skill-inputs"
                  placeholder="e.g. data_set, algorithm, depth"
                  value={newSkill.inputs}
                  onChange={(e) => setNewSkill({ ...newSkill, inputs: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNewSkillOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreateSkill}
                disabled={saveSkillMutation.isPending}
                className="gradient-copper min-w-[140px]"
              >
                {saveSkillMutation.isPending
                  ? <><Loader2 className="size-4 animate-spin mr-2" />Saving...</>
                  : editingSkill ? "Save Changes" : "Deploy Module"
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* ── Search & category filter ───────────────────────────────────────── */}
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search library..."
            className="pl-10 bg-secondary/30 border-border h-11"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search skills"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              aria-pressed={selectedCategory === cat}
              className={`rounded-full px-4 h-11 transition-all ${selectedCategory === cat ? 'gradient-copper border-none text-white shadow-lg' : 'bg-secondary/20 hover:bg-secondary/40'}`}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Skill cards grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Loading skeletons */}
        {skillsLoading && Array.from({ length: 6 }).map((_, i) => (
          <SkillCardSkeleton key={i} />
        ))}

        {/* Error state */}
        {skillsError && !skillsLoading && (
          <div className="col-span-full py-16 flex flex-col items-center text-center gap-4">
            <AlertCircle className="size-12 text-destructive opacity-50" />
            <p className="text-sm text-muted-foreground">Failed to load skills. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetchSkills()}>Retry</Button>
          </div>
        )}

        {/* Skill cards */}
        {!skillsLoading && filteredSkills.map((skill) => {
          const Icon = CATEGORY_ICONS[skill.category] || Zap;
          return (
            <Card
              key={skill.id}
              className={`glass-panel group relative overflow-hidden transition-all hover:border-accent/40 hover:shadow-2xl hover:shadow-accent/5 ${!skill.enabled ? 'opacity-60' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-xl transition-colors ${skill.enabled ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-muted/50 text-muted-foreground'}`}>
                    <Icon className="size-6" aria-hidden />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="icon"
                      className="size-8 text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                      title="View / Edit Code"
                      aria-label={`View code for ${skill.name}`}
                      onClick={() => openCodeViewer(skill)}
                    >
                      <Code2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="size-8 text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Edit ${skill.name}`}
                      onClick={() => handleEditSkill(skill)}
                    >
                      <Edit className="size-4" />
                    </Button>
                    {skill.isCustom && (
                      <Button
                        variant="ghost" size="icon"
                        className="size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Delete ${skill.name}`}
                        onClick={() => setDeletingSkillId(skill.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    <Switch
                      checked={skill.enabled}
                      onCheckedChange={() => toggleSkill(skill)}
                      disabled={saveSkillMutation.isPending}
                      className="data-[state=checked]:bg-accent"
                      aria-label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold tracking-tight">{skill.name}</CardTitle>
                    {skill.isCustom && <Badge variant="secondary" className="text-[9px] h-4">Custom</Badge>}
                  </div>
                  <Badge variant="outline" className="text-[9px] uppercase tracking-widest bg-secondary/50 font-mono">
                    {skill.category}
                  </Badge>
                </div>
                <CardDescription className="mt-3 text-sm leading-relaxed min-h-[60px] line-clamp-3">
                  {skill.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-accent">Parameters</p>
                    <div className="flex flex-wrap gap-2">
                      {skill.inputs && skill.inputs.length > 0 ? skill.inputs.map(input => (
                        <code key={input} className="text-[10px] px-2 py-1 rounded-md bg-secondary text-foreground/80 font-mono border border-border/50">
                          {input}
                        </code>
                      )) : (
                        <span className="text-xs text-muted-foreground italic">No manual params required</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-secondary/10 px-6 py-3 flex justify-between items-center text-[10px] font-medium text-muted-foreground uppercase tracking-widest border-t border-border/50">
                <div className="flex items-center gap-2">
                  <Shield className="size-3" aria-hidden />
                  {skill.isCustom ? 'User Module' : 'System Module'}
                </div>
                {skill.enabled
                  ? <span className="text-green-500 font-bold">Active</span>
                  : <span>Disabled</span>
                }
              </CardFooter>
            </Card>
          );
        })}

        {/* Empty search result */}
        {!skillsLoading && !skillsError && filteredSkills.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center text-center gap-3 border-2 border-dashed border-border rounded-2xl">
            <Search className="size-10 text-muted-foreground opacity-20" aria-hidden />
            <p className="text-sm font-bold">No skills match your search</p>
            <p className="text-xs text-muted-foreground">Try a different search term or category filter.</p>
          </div>
        )}
      </div>

      {/* ── Delete Confirmation Dialog ────────────────────────────────────── */}
      <AlertDialog open={!!deletingSkillId} onOpenChange={(open) => !open && setDeletingSkillId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Skill</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this skill module from your Library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSkillMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSkill}
              disabled={deleteSkillMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteSkillMutation.isPending
                ? <><Loader2 className="size-4 animate-spin mr-2" />Removing...</>
                : 'Remove Skill'
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Skill Code Viewer / Editor ────────────────────────────────────── */}
      {viewCodeSkill && (
        <Dialog open={!!viewCodeSkill} onOpenChange={(open) => {
          if (!open) { setViewCodeSkill(null); setCodeEditing(false); setManifestEditing(false); }
        }}>
          <DialogContent
            className="w-[95vw] max-w-4xl glass-panel p-0 overflow-hidden border-accent/20 h-[90vh] flex flex-col"
            aria-label={`Source code for ${viewCodeSkill.name}`}
          >
            <DialogHeader className="p-4 pb-0 shrink-0">
              <DialogTitle className="text-lg flex items-center gap-2">
                <Code2 className="size-5 text-accent" />
                {viewCodeSkill.name}
                {viewCodeSkill.isCustom && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent font-mono uppercase tracking-widest">Custom</span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="flex gap-1 px-4 pt-3 border-b border-border shrink-0" role="tablist">
              {(['implementation', 'manifest'] as const).map(t => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={codeViewTab === t}
                  onClick={() => { setCodeViewTab(t); setCodeEditing(false); setManifestEditing(false); }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-t-lg whitespace-nowrap transition-colors capitalize ${codeViewTab === t ? 'bg-accent/20 text-accent border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t === 'implementation' ? 'Implementation (TypeScript)' : 'SKILL.md'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden relative">
              <div className="absolute top-3 right-3 z-10 flex gap-2">
                {codeViewTab === 'implementation' && !codeEditing && (
                  <Button variant="ghost" size="sm" className="h-7 px-3 text-xs gap-1.5 bg-background/80 backdrop-blur border border-border" onClick={() => setCodeEditing(true)}>
                    <Edit className="size-3" /> Edit
                  </Button>
                )}
                {codeViewTab === 'manifest' && !manifestEditing && (
                  <Button variant="ghost" size="sm" className="h-7 px-3 text-xs gap-1.5 bg-background/80 backdrop-blur border border-border" onClick={() => setManifestEditing(true)}>
                    <Edit className="size-3" /> Edit
                  </Button>
                )}
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-3 text-xs gap-1.5 bg-background/80 backdrop-blur border border-border"
                  onClick={() => handleCopyCode(codeViewTab === 'implementation' ? editableCode : editableManifest)}
                  aria-label="Copy to clipboard"
                >
                  {codeCopied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>

              {codeViewTab === 'implementation' ? (
                codeEditing ? (
                  <textarea
                    className="w-full h-full p-4 pt-12 text-[12px] leading-relaxed font-mono bg-background/50 text-foreground/90 resize-none focus:outline-none border-0"
                    value={editableCode}
                    onChange={(e) => setEditableCode(e.target.value)}
                    spellCheck={false}
                    aria-label="Edit TypeScript implementation"
                  />
                ) : (
                  <ScrollArea className="h-full">
                    <pre className="p-4 pt-10 text-[12px] leading-relaxed font-mono text-foreground/90 whitespace-pre overflow-x-auto">
                      <code>{editableCode}</code>
                    </pre>
                  </ScrollArea>
                )
              ) : manifestEditing ? (
                <textarea
                  className="w-full h-full p-4 pt-12 text-[12px] leading-relaxed font-mono bg-background/50 text-foreground/90 resize-none focus:outline-none border-0"
                  value={editableManifest}
                  onChange={(e) => setEditableManifest(e.target.value)}
                  spellCheck={false}
                  aria-label="Edit SKILL.md manifest"
                />
              ) : (
                <ScrollArea className="h-full">
                  <pre className="p-4 pt-10 text-[12px] leading-relaxed font-mono text-foreground/90 whitespace-pre overflow-x-auto">
                    <code>{editableManifest}</code>
                  </pre>
                </ScrollArea>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border bg-sidebar/40 flex justify-between items-center shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {codeViewTab === 'implementation' ? 'LangChain Tool · TypeScript' : 'Skill Manifest · Markdown'}
              </p>
              <div className="flex gap-2">
                {codeEditing && (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCodeEditing(false); setEditableCode(generateSkillCode(viewCodeSkill)); }}>Cancel</Button>
                    <Button
                      size="sm"
                      className="gradient-copper text-xs h-8"
                      disabled={saveSkillMutation.isPending}
                      onClick={handleSaveCode}
                    >
                      {saveSkillMutation.isPending ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                      Save Code
                    </Button>
                  </>
                )}
                {manifestEditing && (
                  <>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setManifestEditing(false); setEditableManifest(generateSkillManifest(viewCodeSkill)); }}>Cancel</Button>
                    <Button
                      size="sm"
                      className="gradient-copper text-xs h-8"
                      disabled={saveSkillMutation.isPending}
                      onClick={handleSaveManifest}
                    >
                      {saveSkillMutation.isPending ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                      Save SKILL.md
                    </Button>
                  </>
                )}
                {!codeEditing && !manifestEditing && (
                  <Button variant="ghost" size="sm" onClick={() => setViewCodeSkill(null)} className="text-xs">Close</Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
