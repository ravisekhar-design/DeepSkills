"use client";

import { useState, useMemo } from "react";
import { saveSkill, deleteSkill, Skill, DEFAULT_SKILLS, SystemSettings } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Zap, Search, Shield, Plus, Trash2, Settings2, BrainCircuit, LineChart, Beaker, Sparkles, Wand2, Loader2, PowerOff, Edit } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { generateSkill } from "@/ai/flows/skill-generation";
import { useUser } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";

const CATEGORY_ICONS: Record<string, any> = {
  Finance: LineChart,
  Utility: Settings2,
  Analysis: Search,
  Creative: Sparkles,
  Logic: Beaker,
  Intelligence: BrainCircuit,
};

export default function SkillsPage() {
  const { user } = useUser();
  const { toast } = useToast();

  const { data: customSkills = [] } = useCollection<Skill>(null, 'skills');
  const { data: settings } = useDoc<SystemSettings>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isNewSkillOpen, setIsNewSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [seedIdea, setSeedIdea] = useState("");

  const [newSkill, setNewSkill] = useState({
    name: "",
    description: "",
    category: "Utility" as Skill['category'],
    inputs: "",
  });

  const skills = useMemo(() => {
    const customMap = new Map(customSkills.map(s => [s.id, s]));
    const mergedDefaults = DEFAULT_SKILLS.map(ds => customMap.has(ds.id) ? customMap.get(ds.id)! : ds);
    const pureCustom = customSkills.filter(cs => !DEFAULT_SKILLS.some(ds => ds.id === cs.id));
    return [...mergedDefaults, ...pureCustom];
  }, [customSkills]);

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
    } catch (error) {
      toast({ title: "Synthesis Failed", description: "Failed to connect to the cognitive engine.", variant: "destructive" });
    } finally {
      setGenLoading(false);
    }
  };

  const toggleSkill = (skill: Skill) => {
    if (!user) return;

    const updatedSkill = { ...skill, enabled: !skill.enabled };
    saveSkill(null as any, user.uid, updatedSkill);

    toast({
      title: updatedSkill.enabled ? "Skill Activated" : "Skill Deactivated",
      description: `${updatedSkill.name} has been ${updatedSkill.enabled ? "enabled" : "disabled"}.`
    });
  };

  const handleCreateSkill = () => {
    if (!user || !newSkill.name || !newSkill.description) {
      toast({ title: "Error", description: "Parameters missing.", variant: "destructive" });
      return;
    }

    const skill: Skill = {
      id: editingSkill ? editingSkill.id : Math.random().toString(36).substring(7),
      name: newSkill.name,
      description: newSkill.description,
      category: newSkill.category,
      inputs: newSkill.inputs.split(",").map(i => i.trim()).filter(i => i),
      enabled: editingSkill ? editingSkill.enabled : true,
      isCustom: true,
    };

    saveSkill(null as any, user.uid, skill);
    setIsNewSkillOpen(false);
    resetForm();
    toast({ title: editingSkill ? "Skill Updated" : "Skill Registered", description: `${skill.name} is now available in your Library.` });
  };

  const handleEditSkill = (skill: Skill) => {
    setEditingSkill(skill);
    setNewSkill({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      inputs: skill.inputs ? skill.inputs.join(", ") : "",
    });
    setIsNewSkillOpen(true);
  };

  const resetForm = () => {
    setEditingSkill(null);
    setNewSkill({ name: "", description: "", category: "Utility", inputs: "" });
    setSeedIdea("");
  };

  const handleDeleteSkill = (id: string) => {
    if (user) {
      deleteSkill(null as any, user.uid, id);
      toast({ title: "Skill Purged", description: "The module has been removed from your Library." });
    }
  };

  const filteredSkills = skills.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Finance", "Utility", "Analysis", "Creative", "Logic", "Intelligence"];

  if (!user) return null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <Badge variant="outline" className="border-accent/30 text-accent px-3 py-1 uppercase tracking-widest text-[10px] font-bold">
            Skill Library
          </Badge>
          <h1 className="text-4xl font-bold tracking-tighter">Cognitive Capabilities</h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            A repository of integrated tools. Toggled modules are available to your agents.
          </p>
        </div>
        <Dialog open={isNewSkillOpen} onOpenChange={(open) => {
          setIsNewSkillOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="lg" className="gradient-copper shadow-xl shadow-accent/20 h-12 px-8">
              <Plus className="mr-2 size-5" /> Register Capability
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-accent/20 sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BrainCircuit className="size-5 text-accent" />
                {editingSkill ? "Edit Module Configuration" : "Register New Module"}
              </DialogTitle>
              <DialogDescription>Add a custom skill or use AI to synthesize a professional capability definition.</DialogDescription>
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
                  />
                  <Button onClick={handleSynthesizeSkill} disabled={genLoading} variant="secondary" className="border border-accent/20 hover:bg-accent/10 h-11 px-6">
                    {genLoading ? <Loader2 className="animate-spin size-4" /> : <Wand2 className="size-4 mr-2" />}
                    Synthesize
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-[10px] uppercase tracking-widest font-bold">Skill Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Data Synthesizer"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category" className="text-[10px] uppercase tracking-widest font-bold">Domain</Label>
                  <Select value={newSkill.category} onValueChange={(v: any) => setNewSkill({ ...newSkill, category: v })}>
                    <SelectTrigger>
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
                <Label htmlFor="desc" className="text-[10px] uppercase tracking-widest font-bold">Capability Description</Label>
                <Textarea
                  id="desc"
                  placeholder="Define the functional scope of this module..."
                  className="min-h-[100px] leading-relaxed"
                  value={newSkill.description}
                  onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inputs" className="text-[10px] uppercase tracking-widest font-bold">Required Parameters (comma-separated)</Label>
                <Input
                  id="inputs"
                  placeholder="e.g. data_set, algorithm, depth"
                  value={newSkill.inputs}
                  onChange={(e) => setNewSkill({ ...newSkill, inputs: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNewSkillOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateSkill} className="gradient-copper min-w-[140px]">{editingSkill ? "Save Changes" : "Deploy Module"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 border-b border-border pb-6 overflow-x-auto no-scrollbar">
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search library..."
            className="pl-10 bg-secondary/30 border-border h-11"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-4 h-11 transition-all ${selectedCategory === cat ? 'gradient-copper border-none text-white shadow-lg' : 'bg-secondary/20 hover:bg-secondary/40'}`}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSkills.map((skill) => {
          const Icon = CATEGORY_ICONS[skill.category] || Zap;
          return (
            <Card key={skill.id} className="glass-panel group relative overflow-hidden transition-all hover:border-accent/40 hover:shadow-2xl hover:shadow-accent/5">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-xl transition-colors ${skill.enabled ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-muted/50 text-muted-foreground'}`}>
                    <Icon className="size-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleEditSkill(skill)}>
                      <Edit className="size-4" />
                    </Button>
                    {skill.isCustom && (
                      <Button variant="ghost" size="icon" className="size-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteSkill(skill.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    <Switch checked={skill.enabled} onCheckedChange={() => toggleSkill(skill)} className="data-[state=checked]:bg-accent" />
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
                  <Shield className="size-3" />
                  {skill.isCustom ? 'User Module' : 'System Module'}
                </div>
                {skill.enabled ? <span className="text-green-500 font-bold">Active</span> : <span>Disabled</span>}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
