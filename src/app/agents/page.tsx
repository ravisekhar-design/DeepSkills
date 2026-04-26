"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  DEFAULT_SKILLS, Agent, Skill, DatabaseConnection, FileFolder, FileRecord
} from "@/lib/store";
import {
  generateAgentCode, generateSkillCode,
  generateAgentCodePython, generateSkillCodePython,
} from "@/lib/code-generator";
import { Button } from "@/components/ui/button";
import {
  Card, CardHeader, CardTitle, CardDescription,
  CardContent, CardFooter
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, Edit, MessageSquare, Wand2, Loader2, Zap,
  BrainCircuit, ArrowUp, ArrowDown, Users, ShieldAlert, LogIn,
  Database, Code2, FolderOpen, ChevronRight, ChevronDown,
  File, FolderClosed, Check, Minus, X, AlertCircle, SlidersHorizontal
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetTitle, SheetDescription
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { agentPersonaGeneration } from "@/ai/flows/agent-persona-generation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CodeEditor } from "@/components/ui/code-editor";
import { useUser } from "@/hooks/use-user";
import { useCollection } from "@/hooks/use-collection";
import { useAgents, useSaveAgent, useDeleteAgent } from "@/hooks/queries/use-agents";
import { useSkills } from "@/hooks/queries/use-skills";
import { useSettings } from "@/hooks/queries/use-settings";

type AgentFormTab = 'identity' | 'parameters' | 'skills' | 'datasources' | 'files';

// ── Agent Card Skeleton ──────────────────────────────────────────────────────

function AgentCardSkeleton() {
  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start">
          <Skeleton className="size-14 rounded-2xl" />
        </div>
        <Skeleton className="h-7 w-48 mt-5" />
        <Skeleton className="h-4 w-full mt-2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <Skeleton className="h-11 w-full rounded-lg" />
      </CardFooter>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();

  // ── Data layer — React Query ─────────────────────────────────────────────
  const { data: agents = [], isLoading: agentsLoading, isError: agentsError, refetch: refetchAgents } = useAgents();
  const { data: customSkills = [] } = useSkills();
  const { data: settings } = useSettings();
  const { data: dbConnections = [] } = useCollection<DatabaseConnection>(null, 'databases');
  const saveAgentMutation   = useSaveAgent();
  const deleteAgentMutation = useDeleteAgent();

  const [isNewAgentOpen, setIsNewAgentOpen]   = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [agentFormTab, setAgentFormTab]       = useState<AgentFormTab>('identity');

  // ── Folder / file loading state ──────────────────────────────────────────
  const [fileFolders, setFileFolders]             = useState<FileFolder[]>([]);
  const [foldersLoading, setFoldersLoading]       = useState(false);
  const [folderFilesCache, setFolderFilesCache]   = useState<Map<string, FileRecord[]>>(new Map());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [loadingFolderIds, setLoadingFolderIds]   = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !isNewAgentOpen) return;
    setFoldersLoading(true);
    fetch('/api/files?type=folders')
      .then(r => r.json())
      .then(j => setFileFolders(j.data || []))
      .catch(() => toast({ title: "Failed to load folders", variant: "destructive" }))
      .finally(() => setFoldersLoading(false));
  }, [user?.uid, isNewAgentOpen]); // eslint-disable-line

  // ── Available skills ─────────────────────────────────────────────────────
  const availableSkills = useMemo(() => {
    const customMap      = new Map(customSkills.map(s => [s.id, s]));
    const mergedDefaults = DEFAULT_SKILLS.map(ds => customMap.has(ds.id) ? customMap.get(ds.id)! : ds);
    const pureCustom     = customSkills.filter(cs => !DEFAULT_SKILLS.some(ds => ds.id === cs.id));
    return [...mergedDefaults, ...pureCustom];
  }, [customSkills]);

  // ── Code viewer state ────────────────────────────────────────────────────
  const [editingAgent, setEditingAgent]   = useState<Agent | null>(null);
  const [viewCodeAgent, setViewCodeAgent] = useState<Agent | null>(null);
  const [codeTab, setCodeTab]             = useState<'agent' | string>('agent');
  const [codeLang, setCodeLang]           = useState<'typescript' | 'python'>('typescript');

  // ── Form state ───────────────────────────────────────────────────────────
  const [roleDesc, setRoleDesc]     = useState("");
  const [name, setName]             = useState("");
  const [persona, setPersona]       = useState("");
  const [objectives, setObjectives] = useState("");
  const [parameters, setParameters] = useState({
    creativity: 0.7, maxLength: 1000, temperature: 0.7, topP: 0.9,
  });
  const [selectedSkills, setSelectedSkills]       = useState<string[]>([]);
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders]     = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles]         = useState<string[]>([]);

  // ── Folder / file helpers ────────────────────────────────────────────────
  const toggleFolderExpand = useCallback(async (folderId: string) => {
    if (expandedFolderIds.has(folderId)) {
      setExpandedFolderIds(prev => { const s = new Set(prev); s.delete(folderId); return s; });
      return;
    }
    setExpandedFolderIds(prev => new Set([...prev, folderId]));
    if (!folderFilesCache.has(folderId)) {
      setLoadingFolderIds(prev => new Set([...prev, folderId]));
      try {
        const res  = await fetch(`/api/files?type=files&folderId=${folderId}`);
        const json = await res.json();
        setFolderFilesCache(prev => new Map([...prev, [folderId, json.data || []]]));
      } catch {
        toast({ title: "Failed to load files", variant: "destructive" });
      } finally {
        setLoadingFolderIds(prev => { const s = new Set(prev); s.delete(folderId); return s; });
      }
    }
  }, [expandedFolderIds, folderFilesCache, toast]);

  const cachedFileIds         = (folderId: string) => (folderFilesCache.get(folderId) || []).map(f => f.id);
  const isFolderFullySelected = (folderId: string) => {
    if (selectedFolders.includes(folderId)) return true;
    const ids = cachedFileIds(folderId);
    return ids.length > 0 && ids.every(id => selectedFiles.includes(id));
  };
  const isFolderPartial = (folderId: string) => {
    if (selectedFolders.includes(folderId)) return false;
    const ids = cachedFileIds(folderId);
    return ids.some(id => selectedFiles.includes(id)) && !ids.every(id => selectedFiles.includes(id));
  };

  const toggleFolder = (folderId: string) => {
    if (selectedFolders.includes(folderId)) {
      setSelectedFolders(prev => prev.filter(id => id !== folderId));
      const ids = new Set(cachedFileIds(folderId));
      setSelectedFiles(prev => prev.filter(id => !ids.has(id)));
    } else {
      setSelectedFolders(prev => [...prev, folderId]);
      const ids = new Set(cachedFileIds(folderId));
      setSelectedFiles(prev => prev.filter(id => !ids.has(id)));
    }
  };

  const toggleFile = (fileId: string, folderId: string) => {
    const inFolder = selectedFolders.includes(folderId);
    if (inFolder) {
      const ids = cachedFileIds(folderId).filter(id => id !== fileId);
      setSelectedFolders(prev => prev.filter(id => id !== folderId));
      setSelectedFiles(prev => [...new Set([...prev, ...ids])]);
    } else {
      if (selectedFiles.includes(fileId)) {
        setSelectedFiles(prev => prev.filter(id => id !== fileId));
      } else {
        const newFiles = [...selectedFiles, fileId];
        setSelectedFiles(newFiles);
        const allIds = cachedFileIds(folderId);
        if (allIds.length > 0 && allIds.every(id => newFiles.includes(id))) {
          setSelectedFolders(prev => [...prev, folderId]);
          setSelectedFiles(prev => prev.filter(id => !allIds.includes(id)));
        }
      }
    }
  };

  // ── Persona generation ───────────────────────────────────────────────────
  const [genLoading, setGenLoading] = useState(false);

  const handleGeneratePersona = async () => {
    if (!roleDesc) {
      toast({ title: "Error", description: "Please provide a role description.", variant: "destructive" });
      return;
    }
    setGenLoading(true);
    try {
      const result = await agentPersonaGeneration({
        roleDescription: roleDesc,
        preferredModel: settings?.modelMapping?.personaGeneration
      });
      setPersona(result.persona);
      setObjectives(result.objectives.join("\n"));
      toast({ title: "Persona Synthesized", description: "AI has generated a deep persona profile." });
    } catch {
      toast({ title: "Nexus Link Failed", description: "Failed to generate persona.", variant: "destructive" });
    } finally {
      setGenLoading(false);
    }
  };

  // ── Save agent ───────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!user) {
      toast({ title: "Error", description: "User session not found.", variant: "destructive" });
      return;
    }
    if (!name || !persona) {
      setAgentFormTab('identity');
      toast({
        title: "Required Fields",
        description: "Agent Name and Neural Persona are required.",
        variant: "destructive"
      });
      return;
    }

    const agentData: Agent = {
      id:          editingAgent ? editingAgent.id : Math.random().toString(36).substring(7),
      name,
      persona,
      objectives:  objectives.split("\n").filter(o => o.trim()),
      parameters,
      skills:      selectedSkills,
      databases:   selectedDatabases,
      fileFolders: selectedFolders,
      files:       selectedFiles,
      status:      editingAgent ? editingAgent.status : 'active',
    };

    saveAgentMutation.mutate(agentData, {
      onSuccess: () => {
        setIsNewAgentOpen(false);
        resetForm();
        toast({
          title: editingAgent ? "Configuration Updated" : "Agent Deployed",
          description: `${name}'s neural parameters synchronized.`
        });
      },
      onError: () => toast({
        title: "Save Failed",
        description: "Could not persist agent configuration.",
        variant: "destructive"
      }),
    });
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setName(agent.name);
    setPersona(agent.persona);
    setObjectives(agent.objectives.join("\n"));
    setParameters(agent.parameters as any);
    setSelectedSkills(agent.skills || []);
    setSelectedDatabases(agent.databases || []);
    setSelectedFolders(agent.fileFolders || []);
    setSelectedFiles(agent.files || []);
    setAgentFormTab('identity');
    setIsNewAgentOpen(true);
  };

  const toggleSkill = (skillId: string) =>
    setSelectedSkills(prev =>
      prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
    );

  const moveSkill = (index: number, direction: 'up' | 'down') => {
    const next   = [...selectedSkills];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSelectedSkills(next);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDelete = () => {
    if (!deletingAgentId) return;
    deleteAgentMutation.mutate(deletingAgentId, {
      onSuccess: () => {
        setDeletingAgentId(null);
        toast({ title: "Agent Terminated", description: "Removed from Nexus." });
      },
      onError: () => toast({ title: "Delete Failed", variant: "destructive" }),
    });
  };

  const resetForm = () => {
    setEditingAgent(null);
    setRoleDesc(""); setName(""); setPersona(""); setObjectives("");
    setParameters({ creativity: 0.7, maxLength: 1000, temperature: 0.7, topP: 0.9 });
    setSelectedSkills([]); setSelectedDatabases([]);
    setSelectedFolders([]); setSelectedFiles([]);
    setExpandedFolderIds(new Set()); setFolderFilesCache(new Map());
    setAgentFormTab('identity');
  };

  // ── Code editor save ─────────────────────────────────────────────────────
  const handleSaveAgentCode = (newCode: string) => {
    if (!viewCodeAgent) return;
    const updated = { ...viewCodeAgent, code: newCode };
    saveAgentMutation.mutate(updated, {
      onSuccess: () => {
        setViewCodeAgent(updated);
        toast({ title: 'Code Saved', description: `${viewCodeAgent.name} agent code updated.` });
      },
    });
  };

  const totalFileSelections = selectedFolders.length + selectedFiles.length;

  // ── Nav sections ─────────────────────────────────────────────────────────
  const navSections: {
    key: AgentFormTab; label: string; sub: string;
    Icon: React.ElementType; count?: number; complete: boolean; required: boolean;
  }[] = [
    { key: 'identity',    label: 'Persona & Goals',   sub: 'Identity & objectives',    Icon: BrainCircuit,      required: true,  complete: !!(name && persona) },
    { key: 'parameters',  label: 'Cognitive Settings', sub: 'Inference parameters',     Icon: SlidersHorizontal, required: false, complete: true },
    { key: 'skills',      label: 'Skill Pipeline',     sub: 'Active modules',           Icon: Zap,               count: selectedSkills.length,    required: false, complete: selectedSkills.length > 0 },
    { key: 'datasources', label: 'Data Sources',       sub: 'Connected databases',      Icon: Database,          count: selectedDatabases.length, required: false, complete: selectedDatabases.length > 0 },
    { key: 'files',       label: 'Files & Folders',    sub: 'Context documents',        Icon: FolderOpen,        count: totalFileSelections,      required: false, complete: totalFileSelections > 0 },
  ];

  // ── Auth states ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <Loader2 className="size-12 animate-spin text-accent opacity-20" />
        <p className="text-muted-foreground animate-pulse font-mono text-xs uppercase tracking-widest">Synchronizing Identity...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-6 text-center max-w-md mx-auto px-6">
        <div className="size-20 rounded-3xl bg-accent/10 flex items-center justify-center mb-2">
          <ShieldAlert className="size-10 text-accent opacity-50" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tighter uppercase">Sign In Required</h2>
          <p className="text-muted-foreground leading-relaxed">Sign in to manage your AI agents and skill pipelines.</p>
        </div>
        <Button onClick={() => router.push('/login')} size="lg" className="gradient-copper w-full h-12 text-sm font-bold uppercase tracking-widest shadow-xl shadow-accent/20">
          <LogIn className="size-4 mr-2" /> Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tighter">Autonomous Entities</h1>
          <p className="text-muted-foreground sm:text-lg">Define and orchestrate cognitive agents with specialized personas.</p>
        </div>
        <Button
          size="lg"
          className="gradient-copper shadow-xl shadow-accent/20 h-12 px-8"
          onClick={() => { resetForm(); setIsNewAgentOpen(true); }}
        >
          <Plus className="mr-2 size-5" /> Initialize Deep Agent
        </Button>
      </div>

      {/* ── Agent Cards Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
        {agentsLoading && Array.from({ length: 3 }).map((_, i) => <AgentCardSkeleton key={i} />)}

        {agentsError && !agentsLoading && (
          <div className="col-span-full py-16 flex flex-col items-center text-center gap-4">
            <AlertCircle className="size-12 text-destructive opacity-50" />
            <p className="text-sm text-muted-foreground">Failed to load agents. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetchAgents()}>Retry</Button>
          </div>
        )}

        {!agentsLoading && !agentsError && agents.map((agent) => {
          const folderCount = (agent.fileFolders || []).length;
          const fileCount   = (agent.files || []).length;
          const dbCount     = (agent.databases || []).length;
          return (
            <Card key={agent.id} className="glass-panel group relative overflow-hidden transition-all hover:border-accent/40 border-b-4 border-b-accent/20">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className="size-14 rounded-2xl gradient-sapphire border border-accent/20 flex items-center justify-center font-bold text-2xl text-accent" aria-hidden>
                    {agent.name.charAt(0)}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" role="group" aria-label={`Actions for ${agent.name}`}>
                    <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-accent"
                      aria-label={`View code for ${agent.name}`}
                      onClick={() => { setViewCodeAgent(agent); setCodeTab('agent'); }}
                    >
                      <Code2 className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-accent"
                      aria-label={`Edit ${agent.name}`}
                      onClick={() => handleEdit(agent)}
                    >
                      <Edit className="size-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-9 text-destructive"
                      aria-label={`Delete ${agent.name}`}
                      onClick={() => setDeletingAgentId(agent.id)}
                    >
                      <Trash2 className="size-5" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="mt-5 text-2xl font-bold tracking-tight">{agent.name}</CardTitle>
                <CardDescription className="line-clamp-2 min-h-[48px] text-sm leading-relaxed">{agent.persona}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {agent.skills?.map((skillId: string, index: number) => {
                    const skill = availableSkills.find(s => s.id === skillId);
                    return (
                      <Badge key={skillId} variant="outline" className={`text-[10px] border-accent/20 font-bold px-2.5 py-0.5 ${index === 0 ? 'bg-accent/20 text-accent' : 'bg-accent/5 text-muted-foreground'}`}>
                        {index === 0 && <Zap className="size-2 mr-1 inline" aria-hidden />}
                        {skill?.name || skillId.toUpperCase()}
                      </Badge>
                    );
                  })}
                </div>
                {(dbCount > 0 || folderCount > 0 || fileCount > 0) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {dbCount > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Database className="size-2.5" aria-hidden />{dbCount} DB</span>}
                    {folderCount > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><FolderClosed className="size-2.5" aria-hidden />{folderCount} folder{folderCount !== 1 ? 's' : ''}</span>}
                    {fileCount > 0 && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><File className="size-2.5" aria-hidden />{fileCount} file{fileCount !== 1 ? 's' : ''}</span>}
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-2">
                <Button asChild className="w-full h-11 gradient-sapphire border border-border group-hover:border-accent/30 font-bold uppercase text-xs">
                  <Link href={`/chat?agent=${agent.id}`}>
                    <MessageSquare className="size-4 mr-2" aria-hidden /> Establish Link
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}

        {!agentsLoading && !agentsError && agents.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-[2rem] bg-secondary/5">
            <Users className="size-20 mb-6 text-muted-foreground opacity-10" aria-hidden />
            <h3 className="text-2xl font-bold mb-2">No Cognitive Entities Detected</h3>
            <p className="text-muted-foreground mb-8 text-center max-w-sm">Initialize your first deep agent to begin orchestrating autonomous tasks.</p>
            <Button onClick={() => { resetForm(); setIsNewAgentOpen(true); }} className="gradient-copper h-12 px-10">
              Create Agent
            </Button>
          </div>
        )}
      </div>

      {/* ── Agent Configuration Sheet ────────────────────────────────────────── */}
      <Sheet open={isNewAgentOpen} onOpenChange={(open) => { setIsNewAgentOpen(open); if (!open) resetForm(); }}>
        <SheetContent
          side="right"
          className="!p-0 !gap-0 !w-full sm:!w-[840px] sm:!max-w-[840px] flex flex-col border-l border-accent/20 bg-background"
          aria-label={editingAgent ? `Re-configure ${editingAgent.name}` : 'Initialize Deep Agent'}
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 px-6 pt-5 pb-4 border-b border-border shrink-0 pr-14">
            <div className="size-10 rounded-2xl gradient-copper flex items-center justify-center shrink-0">
              <BrainCircuit className="size-5 text-white" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl font-bold tracking-tight leading-tight">
                {editingAgent ? `Re-configure ${editingAgent.name}` : 'Initialize Deep Agent'}
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {editingAgent
                  ? 'Update persona, cognitive settings, and data access.'
                  : 'Configure neural persona, skill pipeline, and data access for your agent.'}
              </SheetDescription>
            </div>
            {/* Live summary badges */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              {selectedSkills.length > 0 && (
                <Badge variant="secondary" className="text-[9px] h-5 px-2 border border-accent/20">
                  <Zap className="size-2 mr-1" />{selectedSkills.length} skills
                </Badge>
              )}
              {selectedDatabases.length > 0 && (
                <Badge variant="secondary" className="text-[9px] h-5 px-2 border border-accent/20">
                  <Database className="size-2 mr-1" />{selectedDatabases.length} DB
                </Badge>
              )}
              {totalFileSelections > 0 && (
                <Badge variant="secondary" className="text-[9px] h-5 px-2 border border-accent/20">
                  <File className="size-2 mr-1" />{totalFileSelections} files
                </Badge>
              )}
            </div>
          </div>

          {/* ── Body: left nav + scrollable content ─────────────────────────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Left navigation */}
            <nav
              className="w-52 shrink-0 border-r border-border py-3 px-2 flex flex-col gap-0.5 bg-sidebar/30"
              aria-label="Agent configuration sections"
            >
              {navSections.map(({ key, label, sub, Icon, count, complete, required }) => {
                const isActive      = agentFormTab === key;
                const showCheck     = complete && key !== 'parameters';
                const showWarning   = required && !complete && (!!name || !!persona);
                return (
                  <button
                    key={key}
                    onClick={() => setAgentFormTab(key)}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-accent/15 border border-accent/25 shadow-sm'
                        : 'border border-transparent hover:bg-secondary/50 hover:border-border/50'
                    }`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isActive ? 'bg-accent text-white' : 'bg-secondary/60 text-muted-foreground'
                    }`}>
                      <Icon className="size-3.5" aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] font-bold truncate ${isActive ? 'text-accent' : 'text-foreground'}`}>
                        {label}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {count != null && count > 0 ? `${count} active` : sub}
                      </div>
                    </div>
                    {showCheck && (
                      <div className="size-4 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-1.5">
                        <Check className="size-2.5 text-emerald-500" />
                      </div>
                    )}
                    {showWarning && (
                      <div className="size-4 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-1.5">
                        <AlertCircle className="size-2.5 text-amber-500" />
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right content — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto">

              {/* ── Persona & Goals ──────────────────────────────────────────── */}
              {agentFormTab === 'identity' && (
                <div className="p-6 flex flex-col gap-5">
                  <div className="grid gap-3 p-4 rounded-xl bg-accent/5 border border-accent/10">
                    <Label className="text-accent font-bold tracking-widest uppercase text-[10px]">Cognitive Seed</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="E.g. Expert Cyber-Security Analyst"
                        className="bg-secondary/50 border-accent/10 h-11"
                        value={roleDesc}
                        onChange={(e) => setRoleDesc(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGeneratePersona()}
                        aria-label="Role description for AI persona generation"
                      />
                      <Button
                        onClick={handleGeneratePersona}
                        disabled={genLoading}
                        variant="secondary"
                        className="border border-accent/20 h-11 px-6 shrink-0"
                        aria-label="Generate persona with AI"
                      >
                        {genLoading ? <Loader2 className="animate-spin size-4" /> : <Wand2 className="size-4 mr-2" />}
                        Synthesize
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-muted-foreground font-bold tracking-widest uppercase text-[10px]">Agent Identity</Label>
                    <Input
                      placeholder="Agent Name"
                      className="bg-secondary/30 h-11"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Agent name"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-muted-foreground font-bold tracking-widest uppercase text-[10px]">Neural Persona</Label>
                    <Textarea
                      placeholder="Detailed background profile..."
                      className="resize-none min-h-[140px] bg-secondary/30 leading-relaxed"
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      aria-label="Agent persona description"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-muted-foreground font-bold tracking-widest uppercase text-[10px]">Strategic Objectives</Label>
                    <Textarea
                      placeholder="Mission critical goals (one per line)..."
                      className="resize-none min-h-[140px] bg-secondary/30 leading-relaxed"
                      value={objectives}
                      onChange={(e) => setObjectives(e.target.value)}
                      aria-label="Agent strategic objectives"
                    />
                  </div>
                </div>
              )}

              {/* ── Cognitive Settings ───────────────────────────────────────── */}
              {agentFormTab === 'parameters' && (
                <div className="p-6">
                  <div className="rounded-2xl bg-secondary/10 border border-border p-8 flex flex-col gap-10">
                    <div className="flex flex-col gap-5">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold" htmlFor="creativity-slider">Creativity Bias (Temperature)</Label>
                        <Badge variant="secondary" className="font-mono text-accent">{parameters.creativity}</Badge>
                      </div>
                      <Slider
                        id="creativity-slider"
                        value={[parameters.creativity]}
                        min={0} max={1} step={0.1}
                        onValueChange={([v]) => setParameters(p => ({ ...p, creativity: v, temperature: v }))}
                        aria-label="Creativity bias"
                      />
                    </div>
                    <div className="flex flex-col gap-5">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold" htmlFor="maxlength-slider">Inference Horizon (Max Tokens)</Label>
                        <Badge variant="secondary" className="font-mono text-accent">{parameters.maxLength.toLocaleString()}</Badge>
                      </div>
                      <Slider
                        id="maxlength-slider"
                        value={[parameters.maxLength]}
                        min={100} max={128000} step={1000}
                        onValueChange={([v]) => setParameters(p => ({ ...p, maxLength: v }))}
                        aria-label="Max inference tokens"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Skill Pipeline ───────────────────────────────────────────── */}
              {agentFormTab === 'skills' && (
                <div className="p-6 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex flex-col gap-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Available Modules</Label>
                      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {availableSkills.map((skill) => {
                          const active = selectedSkills.includes(skill.id);
                          return (
                            <div
                              key={skill.id}
                              role="checkbox"
                              aria-checked={active}
                              tabIndex={0}
                              className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${active ? 'bg-accent/10 border-accent/40' : 'bg-secondary/10 border-border hover:bg-secondary/20'}`}
                              onClick={() => toggleSkill(skill.id)}
                              onKeyDown={(e) => e.key === ' ' && toggleSkill(skill.id)}
                            >
                              <div className={`size-4 rounded flex items-center justify-center border shrink-0 mt-0.5 ${active ? 'bg-accent border-accent' : 'border-border'}`}>
                                {active && <Check className="size-2.5 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{skill.name}</p>
                                <p className="text-[10px] text-muted-foreground line-clamp-1">{skill.description}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-accent">Active Pipeline</Label>
                      <div className="bg-secondary/10 rounded-2xl p-4 border border-border flex flex-col gap-2 min-h-[200px] max-h-[520px] overflow-y-auto">
                        {selectedSkills.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-6 opacity-50">No skills selected yet</p>
                        )}
                        {selectedSkills.map((skillId, index) => {
                          const skill = availableSkills.find(s => s.id === skillId);
                          return (
                            <div key={skillId} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border shadow-sm group">
                              <div className="size-6 rounded bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0 text-xs font-bold truncate">
                                {skill?.name || skillId}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="size-6" onClick={() => moveSkill(index, 'up')} disabled={index === 0} aria-label="Move skill up">
                                  <ArrowUp className="size-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-6" onClick={() => moveSkill(index, 'down')} disabled={index === selectedSkills.length - 1} aria-label="Move skill down">
                                  <ArrowDown className="size-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Data Sources ─────────────────────────────────────────────── */}
              {agentFormTab === 'datasources' && (
                <div className="p-6 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex flex-col gap-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Available Databases</Label>
                      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {dbConnections.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                            <Database className="size-10 mb-3 text-muted-foreground opacity-20" />
                            <p className="text-sm font-bold mb-1">No database connections</p>
                            <p className="text-xs text-muted-foreground">Add connections in the <strong>Databases</strong> page first.</p>
                          </div>
                        ) : (
                          dbConnections.map((conn: DatabaseConnection) => {
                            const active = selectedDatabases.includes(conn.id);
                            return (
                              <div
                                key={conn.id}
                                role="checkbox"
                                aria-checked={active}
                                tabIndex={0}
                                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${active ? 'bg-accent/10 border-accent/40' : 'bg-secondary/10 border-border hover:bg-secondary/20'}`}
                                onClick={() => setSelectedDatabases(prev => prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id])}
                                onKeyDown={(e) => e.key === ' ' && setSelectedDatabases(prev => prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id])}
                              >
                                <div className={`size-4 rounded flex items-center justify-center border shrink-0 mt-0.5 ${active ? 'bg-accent border-accent' : 'border-border'}`}>
                                  {active && <Check className="size-2.5 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate">{conn.name}</p>
                                  <p className="text-[10px] text-muted-foreground line-clamp-1">{conn.type}{conn.database ? ` · ${conn.database}` : ''}</p>
                                </div>
                                {conn.readOnly && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-500 shrink-0">Read-only</Badge>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-accent">Connected Sources</Label>
                      <div className="bg-secondary/10 rounded-2xl p-4 border border-border flex flex-col gap-2 min-h-[200px] max-h-[520px] overflow-y-auto">
                        {selectedDatabases.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-6 opacity-50">No databases selected yet</p>
                        )}
                        {selectedDatabases.map((dbId) => {
                          const conn = dbConnections.find((c: DatabaseConnection) => c.id === dbId);
                          return (
                            <div key={dbId} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border shadow-sm group">
                              <div className="size-6 rounded bg-accent/20 flex items-center justify-center shrink-0">
                                <Database className="size-3.5 text-accent" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{conn?.name || dbId}</p>
                                {conn && <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{conn.type}</p>}
                              </div>
                              <button
                                className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => setSelectedDatabases(prev => prev.filter(id => id !== dbId))}
                                aria-label={`Remove ${conn?.name || dbId}`}
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Files & Folders ──────────────────────────────────────────── */}
              {agentFormTab === 'files' && (
                <div className="p-6 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex flex-col gap-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Available Folders &amp; Files</Label>
                      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {foldersLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="size-6 animate-spin text-accent opacity-50" />
                          </div>
                        ) : fileFolders.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                            <FolderOpen className="size-10 mb-3 text-muted-foreground opacity-20" />
                            <p className="text-sm font-bold mb-1">No file folders</p>
                            <p className="text-xs text-muted-foreground">Create folders in the <strong>Databases → File Storage</strong> tab first.</p>
                          </div>
                        ) : (
                          fileFolders.map((folder: FileFolder) => {
                            const isExpanded     = expandedFolderIds.has(folder.id);
                            const isLoadingFiles = loadingFolderIds.has(folder.id);
                            const fullySelected  = isFolderFullySelected(folder.id);
                            const partial        = isFolderPartial(folder.id);
                            const files          = folderFilesCache.get(folder.id) || [];
                            return (
                              <div key={folder.id} className="rounded-xl border border-border overflow-hidden">
                                <div
                                  className={`flex items-start gap-3 p-3 transition-all cursor-pointer ${fullySelected ? 'bg-accent/10' : partial ? 'bg-accent/5' : 'bg-secondary/10 hover:bg-secondary/20'}`}
                                  onClick={() => toggleFolder(folder.id)}
                                  role="checkbox"
                                  aria-checked={fullySelected ? true : partial ? 'mixed' : false}
                                  tabIndex={0}
                                  onKeyDown={(e) => e.key === ' ' && toggleFolder(folder.id)}
                                >
                                  <div className={`size-4 rounded flex items-center justify-center border shrink-0 mt-0.5 ${fullySelected ? 'bg-accent border-accent' : partial ? 'bg-accent/30 border-accent/50' : 'border-border'}`}>
                                    {fullySelected && <Check className="size-2.5 text-white" />}
                                    {partial && <Minus className="size-2.5 text-accent" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{folder.name}</p>
                                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                                      {folder.fileCount ?? 0} file{folder.fileCount !== 1 ? 's' : ''}
                                      {fullySelected && <span className="ml-1.5 text-accent">· entire folder</span>}
                                      {partial && <span className="ml-1.5 text-accent/70">· partial</span>}
                                    </p>
                                  </div>
                                  <button
                                    className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                                    onClick={(e) => { e.stopPropagation(); toggleFolderExpand(folder.id); }}
                                    aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                                  >
                                    {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                  </button>
                                </div>
                                {isExpanded && (
                                  <div className="border-t border-border bg-background/30">
                                    {isLoadingFiles ? (
                                      <div className="flex items-center justify-center py-4">
                                        <Loader2 className="size-4 animate-spin text-accent opacity-50 mr-2" />
                                        <span className="text-xs text-muted-foreground">Loading files...</span>
                                      </div>
                                    ) : files.length === 0 ? (
                                      <p className="text-xs text-muted-foreground text-center py-4 opacity-50">No files in this folder</p>
                                    ) : (
                                      <div className="p-2 space-y-1">
                                        {files.map((file: FileRecord) => {
                                          const fileSelected    = selectedFolders.includes(folder.id) || selectedFiles.includes(file.id);
                                          const coveredByFolder = selectedFolders.includes(folder.id);
                                          return (
                                            <div
                                              key={file.id}
                                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${fileSelected ? 'bg-accent/10' : 'hover:bg-secondary/20'}`}
                                              onClick={() => toggleFile(file.id, folder.id)}
                                              role="checkbox"
                                              aria-checked={fileSelected}
                                              tabIndex={0}
                                              onKeyDown={(e) => e.key === ' ' && toggleFile(file.id, folder.id)}
                                            >
                                              <div className={`size-3.5 rounded flex items-center justify-center border shrink-0 ${fileSelected ? 'bg-accent border-accent' : 'border-border'}`}>
                                                {fileSelected && <Check className="size-2 text-white" />}
                                              </div>
                                              <File className="size-3.5 text-muted-foreground shrink-0" aria-hidden />
                                              <span className="text-xs truncate flex-1">{file.name}</span>
                                              {coveredByFolder && <span className="text-[9px] text-accent/60 shrink-0">via folder</span>}
                                              {file.size > 0 && <span className="text-[9px] text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)} KB</span>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-accent">Active Context</Label>
                      <div className="bg-secondary/10 rounded-2xl p-4 border border-border flex flex-col gap-2 min-h-[200px] max-h-[520px] overflow-y-auto">
                        {selectedFolders.length === 0 && selectedFiles.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-6 opacity-50">No files selected yet</p>
                        )}
                        {selectedFolders.map((folderId) => {
                          const folder = fileFolders.find((f: FileFolder) => f.id === folderId);
                          return (
                            <div key={folderId} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border shadow-sm group">
                              <div className="size-6 rounded bg-blue-400/20 flex items-center justify-center shrink-0">
                                <FolderClosed className="size-3.5 text-blue-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{folder?.name || folderId}</p>
                                <p className="text-[10px] text-muted-foreground">Entire folder</p>
                              </div>
                              <button
                                className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => toggleFolder(folderId)}
                                aria-label={`Remove folder ${folder?.name || folderId}`}
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          );
                        })}
                        {selectedFiles.map((fileId) => {
                          let fileName = fileId, folderName = '';
                          for (const [fid, files] of folderFilesCache.entries()) {
                            const match = files.find((f: FileRecord) => f.id === fileId);
                            if (match) {
                              fileName   = match.name;
                              const f    = fileFolders.find((f: FileFolder) => f.id === fid);
                              folderName = f?.name || '';
                              break;
                            }
                          }
                          return (
                            <div key={fileId} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border shadow-sm group">
                              <div className="size-6 rounded bg-accent/20 flex items-center justify-center shrink-0">
                                <File className="size-3.5 text-accent" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{fileName}</p>
                                {folderName && <p className="text-[10px] text-muted-foreground truncate">{folderName}</p>}
                              </div>
                              <button
                                className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                onClick={() => setSelectedFiles(prev => prev.filter(id => id !== fileId))}
                                aria-label={`Remove file ${fileName}`}
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="shrink-0 px-6 py-4 border-t border-border bg-sidebar/40 flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground min-w-0 truncate hidden sm:block">
              {name ? (
                <>
                  <span className="font-semibold text-foreground">{name}</span>
                  {selectedSkills.length > 0 && <span> · {selectedSkills.length} skill{selectedSkills.length !== 1 ? 's' : ''}</span>}
                  {selectedDatabases.length > 0 && <span> · {selectedDatabases.length} DB</span>}
                  {totalFileSelections > 0 && <span> · {totalFileSelections} file{totalFileSelections !== 1 ? 's' : ''}</span>}
                </>
              ) : (
                <span className="italic opacity-40">No agent name set</span>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => setIsNewAgentOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saveAgentMutation.isPending}
                className="gradient-copper min-w-[160px] h-10 text-sm font-bold uppercase tracking-wide"
              >
                {saveAgentMutation.isPending
                  ? <><Loader2 className="size-4 animate-spin mr-2" />Saving...</>
                  : editingAgent ? 'Update Profile' : 'Deploy to Nexus'
                }
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deletingAgentId} onOpenChange={(open) => !open && setDeletingAgentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this agent from Nexus. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAgentMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteAgentMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteAgentMutation.isPending
                ? <><Loader2 className="size-4 animate-spin mr-2" />Removing...</>
                : 'Remove Agent'
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Code Viewer / Editor ─────────────────────────────────────────────── */}
      {viewCodeAgent && (() => {
        const agentSkills = (viewCodeAgent.skills ?? [])
          .map(id => availableSkills.find(s => s.id === id))
          .filter(Boolean) as Skill[];

        const ext = codeLang === 'python' ? 'py' : 'ts';
        const agentFile = `agent.${ext}`;
        const tabs = [
          { key: 'agent', label: agentFile },
          ...agentSkills.map(s => ({
            key: s.id,
            label: `skills/${s.name.toLowerCase().replace(/\s+/g, '_')}.${ext}`,
          })),
        ];

        // Python is generated read-only on every render — saved custom code is
        // TypeScript-only (agent.code), so the editable path stays on the TS view.
        const getCode = (tab: string) => {
          if (tab === 'agent') {
            return codeLang === 'python'
              ? generateAgentCodePython(viewCodeAgent, availableSkills)
              : viewCodeAgent.code || generateAgentCode(viewCodeAgent, availableSkills);
          }
          const skill = agentSkills.find(s => s.id === tab);
          if (!skill) return '';
          return codeLang === 'python'
            ? generateSkillCodePython(skill)
            : generateSkillCode(skill);
        };

        const activeTab = tabs.find(t => t.key === codeTab) ?? tabs[0];
        const isAgentTab = codeTab === 'agent';
        const editable = isAgentTab && codeLang === 'typescript';

        return (
          <Dialog open={!!viewCodeAgent} onOpenChange={(open) => { if (!open) setViewCodeAgent(null); }}>
            <DialogContent
              className="w-[95vw] max-w-5xl glass-panel p-0 overflow-hidden border-accent/20 h-[90vh] flex flex-col"
              aria-label={`Source code for ${viewCodeAgent.name}`}
            >
              <DialogHeader className="px-4 pt-4 pb-0 shrink-0">
                <DialogTitle className="text-base flex items-center justify-between gap-2 font-mono">
                  <div className="flex items-center gap-2">
                    <Code2 className="size-4 text-accent" />
                    <span className="text-accent">{viewCodeAgent.name}</span>
                    <span className="text-muted-foreground font-normal">/ source</span>
                  </div>

                  {/* TS / Python language toggle */}
                  <div className="flex items-center rounded-md border border-[#30363d] overflow-hidden text-[10px]" role="tablist" aria-label="Language">
                    {(['typescript', 'python'] as const).map(lang => (
                      <button
                        key={lang}
                        role="tab"
                        aria-selected={codeLang === lang}
                        onClick={() => setCodeLang(lang)}
                        className={`px-3 py-1 transition-colors ${
                          codeLang === lang
                            ? 'bg-accent/20 text-accent'
                            : 'text-[#8b949e] hover:text-[#c9d1d9]'
                        }`}
                      >
                        {lang === 'typescript' ? 'TypeScript' : 'Python'}
                      </button>
                    ))}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="flex gap-0 px-4 pt-3 border-b border-[#30363d] overflow-x-auto shrink-0 bg-[#0d1117]" role="tablist">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={codeTab === t.key}
                    onClick={() => setCodeTab(t.key)}
                    className={`px-3 py-2 text-[11px] font-mono whitespace-nowrap transition-colors border-b-2 -mb-px ${
                      codeTab === t.key
                        ? 'border-[#f78166] text-[#e6edf3] bg-[#0d1117]'
                        : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 p-0">
                <CodeEditor
                  key={`${codeTab}-${codeLang}`}
                  code={getCode(codeTab)}
                  filename={activeTab.label}
                  language={codeLang}
                  editable={editable}
                  onSave={editable ? handleSaveAgentCode : undefined}
                  className="h-full rounded-none border-0"
                />
              </div>

              <div className="flex justify-end px-4 py-2.5 border-t border-[#30363d] bg-[#161b22] shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setViewCodeAgent(null)} className="text-xs text-[#8b949e] hover:text-[#c9d1d9]">
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
