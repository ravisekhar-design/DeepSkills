
"use client";

import { useState, useMemo } from "react";
import { saveAgent, deleteAgent, Agent, DEFAULT_SKILLS, Skill, SystemSettings, DatabaseConnection } from "@/lib/store";
import { generateAgentCode, generateSkillCode, generateSkillManifest } from "@/lib/code-generator";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Plus, Trash2, Edit, MessageSquare, Wand2, Loader2, Zap, BrainCircuit, ArrowUp, ArrowDown, Users, ShieldAlert, LogIn, Database, Code2, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { agentPersonaGeneration } from "@/ai/flows/agent-persona-generation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useCollection } from "@/hooks/use-collection";
import { useDoc } from "@/hooks/use-doc";

export default function AgentsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const { toast } = useToast();

  const { data: agents = [] } = useCollection<Agent>(null, 'agents');
  const { data: customSkills = [] } = useCollection<Skill>(null, 'skills');
  const { data: dbConnections = [] } = useCollection<DatabaseConnection>(null, 'databases');
  const { data: settings } = useDoc<SystemSettings>(null);

  const availableSkills = useMemo(() => {
    const customMap = new Map(customSkills.map(s => [s.id, s]));
    const mergedDefaults = DEFAULT_SKILLS.map(ds => customMap.has(ds.id) ? customMap.get(ds.id)! : ds);
    const pureCustom = customSkills.filter(cs => !DEFAULT_SKILLS.some(ds => ds.id === cs.id));
    return [...mergedDefaults, ...pureCustom];
  }, [customSkills]);

  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [viewCodeAgent, setViewCodeAgent] = useState<Agent | null>(null);
  const [codeTab, setCodeTab] = useState<'agent' | string>('agent');
  const [codeCopied, setCodeCopied] = useState(false);

  const [roleDesc, setRoleDesc] = useState("");
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [objectives, setObjectives] = useState("");
  const [parameters, setParameters] = useState({
    creativity: 0.7,
    maxLength: 1000,
    temperature: 0.7,
    topP: 0.9,
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);


  const handleGeneratePersona = async () => {
    if (!roleDesc) {
      toast({ title: "Error", description: "Please provide a role description.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const result = await agentPersonaGeneration({
        roleDescription: roleDesc,
        preferredModel: settings?.modelMapping?.personaGeneration
      });
      setPersona(result.persona);
      setObjectives(result.objectives.join("\n"));
      toast({ title: "Persona Synthesized", description: "AI has generated a deep persona profile." });
    } catch (error) {
      toast({ title: "Nexus Link Failed", description: "Failed to generate persona.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!user) {
      toast({ title: "Error", description: "User session not found.", variant: "destructive" });
      return;
    }
    if (!name || !persona) {
      toast({ title: "Error", description: "Agent Name and Neural Persona are required. Please return to the 'Persona & Goals' tab to fill them out.", variant: "destructive" });
      return;
    }

    const agentData: Agent = {
      id: editingAgent ? editingAgent.id : Math.random().toString(36).substring(7),
      name,
      persona,
      objectives: objectives.split("\n").filter(o => o.trim()),
      parameters,
      skills: selectedSkills,
      databases: selectedDatabases,
      status: editingAgent ? editingAgent.status : 'active',
    };

    saveAgent(agentData);
    setIsNewAgentOpen(false);
    resetForm();
    toast({
      title: editingAgent ? "Configuration Updated" : "Agent Deployed",
      description: `${name}'s neural parameters synchronized.`
    });
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setName(agent.name);
    setPersona(agent.persona);
    setObjectives(agent.objectives.join("\n"));
    setParameters(agent.parameters as any);
    setSelectedSkills(agent.skills || []);
    setSelectedDatabases(agent.databases || []);
    setIsNewAgentOpen(true);
  };

  const toggleSkill = (skillId: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
    );
  };

  const moveSkill = (index: number, direction: 'up' | 'down') => {
    const newSkills = [...selectedSkills];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSkills.length) return;
    [newSkills[index], newSkills[targetIndex]] = [newSkills[targetIndex], newSkills[index]];
    setSelectedSkills(newSkills);
  };

  const handleDelete = (id: string) => {
    if (user) {
      deleteAgent(id);
      toast({ title: "Agent Terminated", description: "Removed from Nexus." });
    }
  };

  const resetForm = () => {
    setEditingAgent(null);
    setRoleDesc("");
    setName("");
    setPersona("");
    setObjectives("");
    setParameters({
      creativity: 0.7,
      maxLength: 1000,
      temperature: 0.7,
      topP: 0.9,
    });
    setSelectedSkills([]);
    setSelectedDatabases([]);
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tighter">Autonomous Entities</h1>
          <p className="text-muted-foreground sm:text-lg">Define and orchestrate cognitive agents with specialized personas.</p>
        </div>
        <Dialog open={isNewAgentOpen} onOpenChange={(open) => {
          setIsNewAgentOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="lg" className="gradient-copper shadow-xl shadow-accent/20 h-12 px-8">
              <Plus className="mr-2 size-5" /> Initialize Deep Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-4xl glass-panel p-0 overflow-hidden border-accent/20">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-2xl flex items-center gap-3">
                <BrainCircuit className="size-7 text-accent" />
                {editingAgent ? `Re-configure ${editingAgent.name}` : 'Initialize Deep Agent'}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="identity" className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-sidebar/20 px-6 h-12 overflow-x-auto">
                <TabsTrigger value="identity" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-xs sm:text-sm">Persona & Goals</TabsTrigger>
                <TabsTrigger value="parameters" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-xs sm:text-sm">Cognitive Settings</TabsTrigger>
                <TabsTrigger value="skills" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-xs sm:text-sm">Skill Pipeline</TabsTrigger>
                <TabsTrigger value="datasources" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-xs sm:text-sm">
                  <Database className="size-3 mr-1.5 inline" />Data Sources
                  {selectedDatabases.length > 0 && <span className="ml-1.5 size-4 rounded-full bg-accent text-white text-[9px] flex items-center justify-center inline-flex">{selectedDatabases.length}</span>}
                </TabsTrigger>
              </TabsList>

              <div className="p-6 h-[60vh] overflow-hidden">
                <TabsContent value="identity" className="space-y-6 mt-0 h-full overflow-y-auto custom-scrollbar pr-2">
                  <div className="grid gap-3 p-4 rounded-xl bg-accent/5 border border-accent/10">
                    <Label className="text-accent font-bold tracking-widest uppercase text-[10px]">Cognitive Seed</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="E.g. Expert Cyber-Security Analyst"
                        className="bg-secondary/50 border-accent/10 h-11"
                        value={roleDesc}
                        onChange={(e) => setRoleDesc(e.target.value)}
                      />
                      <Button onClick={handleGeneratePersona} disabled={loading} variant="secondary" className="border border-accent/20 h-11 px-6">
                        {loading ? <Loader2 className="animate-spin size-4" /> : <Wand2 className="size-4 mr-2" />}
                        Synthesize
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 pt-2">
                    <div className="grid gap-2">
                      <Label className="text-muted-foreground font-bold tracking-widest uppercase text-[10px]">Agent Identity</Label>
                      <Input
                        placeholder="Agent Name"
                        className="bg-secondary/30 h-11"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-muted-foreground font-bold tracking-widest uppercase text-[10px]">Neural Persona</Label>
                      <Textarea
                        placeholder="Detailed background profile..."
                        className="min-h-[140px] bg-secondary/30 leading-relaxed"
                        value={persona}
                        onChange={(e) => setPersona(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-muted-foreground font-bold tracking-widest uppercase text-[10px]">Strategic Objectives</Label>
                      <Textarea
                        placeholder="Mission critical goals..."
                        className="bg-secondary/30"
                        value={objectives}
                        onChange={(e) => setObjectives(e.target.value)}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="parameters" className="space-y-8 mt-0 h-full overflow-y-auto custom-scrollbar pr-2">
                  <div className="p-6 rounded-2xl bg-secondary/10 border border-border space-y-10">
                    <div className="space-y-5">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold">Creativity Bias (Temperature)</Label>
                        <Badge variant="secondary" className="font-mono text-accent">{parameters.creativity}</Badge>
                      </div>
                      <Slider
                        value={[parameters.creativity]}
                        min={0} max={1} step={0.1}
                        onValueChange={([v]) => setParameters(p => ({ ...p, creativity: v, temperature: v }))}
                      />
                    </div>
                    <div className="space-y-5">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-bold">Inference Horizon (Max Tokens)</Label>
                        <Badge variant="secondary" className="font-mono text-accent">{parameters.maxLength}</Badge>
                      </div>
                      <Slider
                        value={[parameters.maxLength]}
                        min={100} max={128000} step={1000}
                        onValueChange={([v]) => setParameters(p => ({ ...p, maxLength: v }))}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="skills" className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-0 h-full overflow-hidden">
                  <div className="space-y-4 overflow-hidden flex flex-col">
                    <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Available Modules</Label>
                    <ScrollArea className="flex-1 pr-4">
                      <div className="space-y-2">
                        {availableSkills.map((skill) => (
                          <div
                            key={skill.id}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedSkills.includes(skill.id)
                              ? 'bg-accent/10 border-accent/40'
                              : 'bg-secondary/10 border-border hover:bg-secondary/20'
                              }`}
                            onClick={() => toggleSkill(skill.id)}
                          >
                            <Checkbox
                              checked={selectedSkills.includes(skill.id)}
                              onCheckedChange={() => toggleSkill(skill.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">{skill.name}</p>
                              <p className="text-[10px] text-muted-foreground line-clamp-1">{skill.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <div className="space-y-4 overflow-hidden flex flex-col bg-secondary/10 rounded-2xl p-4 border border-border">
                    <Label className="text-[10px] uppercase tracking-widest font-bold text-accent">Active Pipeline</Label>
                    <ScrollArea className="flex-1 pr-2">
                      <div className="space-y-2">
                        {selectedSkills.map((skillId, index) => {
                          const skill = availableSkills.find(s => s.id === skillId);
                          return (
                            <div key={skillId} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border shadow-sm group">
                              <div className="size-6 rounded bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0 text-xs font-bold truncate">
                                {skill?.name || skillId}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="size-6" onClick={() => moveSkill(index, 'up')} disabled={index === 0}>
                                  <ArrowUp className="size-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-6" onClick={() => moveSkill(index, 'down')} disabled={index === selectedSkills.length - 1}>
                                  <ArrowDown className="size-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="datasources" className="mt-0 h-full overflow-y-auto custom-scrollbar pr-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">Connected Databases</p>
                      <p className="text-xs text-muted-foreground">Select which databases this agent can query during chat.</p>
                    </div>
                    <Badge variant="outline" className="text-accent border-accent/30 text-[10px]">{selectedDatabases.length} selected</Badge>
                  </div>
                  {dbConnections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                      <Database className="size-10 mb-3 text-muted-foreground opacity-20" />
                      <p className="text-sm font-bold mb-1">No database connections</p>
                      <p className="text-xs text-muted-foreground">Add connections in the <strong>Databases</strong> page first.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dbConnections.map((conn: DatabaseConnection) => (
                        <div
                          key={conn.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedDatabases.includes(conn.id) ? 'bg-accent/10 border-accent/40' : 'bg-secondary/10 border-border hover:bg-secondary/20'}`}
                          onClick={() => setSelectedDatabases(prev => prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id])}
                        >
                          <Checkbox checked={selectedDatabases.includes(conn.id)} onCheckedChange={() => setSelectedDatabases(prev => prev.includes(conn.id) ? prev.filter(id => id !== conn.id) : [...prev, conn.id])} />
                          <Database className="size-4 text-accent shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">{conn.name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{conn.type}{conn.database ? ` · ${conn.database}` : ''}</p>
                          </div>
                          {conn.readOnly && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-500">Read-only</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="p-6 pt-4 border-t bg-sidebar/40">
              <Button variant="ghost" onClick={() => setIsNewAgentOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} className="gradient-copper min-w-[160px] h-11 text-sm font-bold uppercase">
                {editingAgent ? 'Update Profile' : 'Deploy to Nexus'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
        {agents.map((agent) => (
          <Card key={agent.id} className="glass-panel group relative overflow-hidden transition-all hover:border-accent/40 border-b-4 border-b-accent/20">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="size-14 rounded-2xl gradient-sapphire border border-accent/20 flex items-center justify-center font-bold text-2xl text-accent">
                  {agent.name.charAt(0)}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-accent" title="View Code" onClick={() => { setViewCodeAgent(agent); setCodeTab('agent'); }}>
                    <Code2 className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-accent" onClick={() => handleEdit(agent)}>
                    <Edit className="size-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-9 text-destructive" onClick={() => handleDelete(agent.id)}>
                    <Trash2 className="size-5" />
                  </Button>
                </div>
              </div>
              <CardTitle className="mt-5 text-2xl font-bold tracking-tight">{agent.name}</CardTitle>
              <CardDescription className="line-clamp-2 min-h-[48px] text-sm leading-relaxed">{agent.persona}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {agent.skills?.map((skillId: string, index: number) => {
                  const skill = availableSkills.find(s => s.id === skillId);
                  return (
                    <Badge key={skillId} variant="outline" className={`text-[10px] border-accent/20 font-bold px-2.5 py-0.5 ${index === 0 ? 'bg-accent/20 text-accent' : 'bg-accent/5 text-muted-foreground'}`}>
                      {index === 0 && <Zap className="size-2 mr-1 inline" />}
                      {skill?.name || skillId.toUpperCase()}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
            <CardFooter className="pt-2">
              <Button asChild className="w-full h-11 gradient-sapphire border border-border group-hover:border-accent/30 font-bold uppercase text-xs">
                <Link href={`/chat?agent=${agent.id}`}>
                  <MessageSquare className="size-4 mr-2" /> Establish Link
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
        {agents.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-[2rem] bg-secondary/5">
            <Users className="size-20 mb-6 text-muted-foreground opacity-10" />
            <h3 className="text-2xl font-bold mb-2">No Cognitive Entities Detected</h3>
            <p className="text-muted-foreground mb-8 text-center max-w-sm">Initialize your first deep agent to begin orchestrating autonomous tasks.</p>
            <Button onClick={() => setIsNewAgentOpen(true)} className="gradient-copper h-12 px-10">
              Create Agent
            </Button>
          </div>
        )}
      </div>

      {/* ── Code Viewer Dialog ── */}
      {viewCodeAgent && (() => {
        const agentSkills = (viewCodeAgent.skills ?? []).map(id => availableSkills.find(s => s.id === id)).filter(Boolean) as Skill[];
        const tabs = [
          { key: 'agent', label: 'Agent Code' },
          ...agentSkills.map(s => ({ key: s.id, label: s.name })),
        ];
        const activeCode = codeTab === 'agent'
          ? generateAgentCode(viewCodeAgent, availableSkills)
          : (() => {
              const skill = agentSkills.find(s => s.id === codeTab);
              return skill ? generateSkillCode(skill) : '';
            })();

        return (
          <Dialog open={!!viewCodeAgent} onOpenChange={(open) => { if (!open) setViewCodeAgent(null); }}>
            <DialogContent className="w-[95vw] max-w-4xl glass-panel p-0 overflow-hidden border-accent/20 h-[90vh] flex flex-col">
              <DialogHeader className="p-4 pb-0 shrink-0">
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Code2 className="size-5 text-accent" />
                  {viewCodeAgent.name} — Source Code
                </DialogTitle>
              </DialogHeader>

              {/* Tabs */}
              <div className="flex gap-1 px-4 pt-3 border-b border-border overflow-x-auto shrink-0">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setCodeTab(t.key)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-t-lg whitespace-nowrap transition-colors ${codeTab === t.key ? 'bg-accent/20 text-accent border-b-2 border-accent' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Code area */}
              <div className="flex-1 overflow-hidden relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-3 right-3 z-10 h-7 px-3 text-xs gap-1.5 bg-background/80 backdrop-blur border border-border"
                  onClick={() => handleCopyCode(activeCode)}
                >
                  {codeCopied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </Button>
                <ScrollArea className="h-full">
                  <pre className="p-4 pt-10 text-[12px] leading-relaxed font-mono text-foreground/90 whitespace-pre overflow-x-auto">
                    <code>{activeCode}</code>
                  </pre>
                </ScrollArea>
              </div>

              <div className="px-4 py-3 border-t border-border bg-sidebar/40 flex justify-between items-center shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  {codeTab === 'agent' ? 'LangGraph ReAct Agent · TypeScript' : 'LangChain Tool · TypeScript'}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setViewCodeAgent(null)} className="text-xs">Close</Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
