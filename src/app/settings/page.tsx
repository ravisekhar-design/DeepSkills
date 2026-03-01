"use client";

import { useMemo } from "react";
import {
  Settings2,
  ShieldAlert,
  Cpu,
  Globe,
  Cloud,
  ArrowRightLeft,
  Key,
  BrainCircuit,
  Sparkles,
  Zap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { saveSystemSettings, SystemSettings, DEFAULT_SETTINGS } from "@/lib/store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useEffect, useState } from "react";

const AVAILABLE_MODELS = [
  { id: 'googleai/gemini-1.5-flash', label: 'Google Gemini 1.5 Flash (Stable)', provider: 'google' },
  { id: 'googleai/gemini-1.5-pro', label: 'Google Gemini 1.5 Pro (Deep)', provider: 'google' },
  { id: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini', provider: 'openai' },
  { id: 'openai/gpt-4o', label: 'OpenAI GPT-4o', provider: 'openai' },
  { id: 'anthropic/claude-3-5-sonnet', label: 'Anthropic Claude 3.5 Sonnet', provider: 'anthropic' }
];

const TASK_LABELS: Record<string, string> = {
  personaGeneration: 'Persona Synthesis',
  skillSynthesis: 'Skill Architecture',
  conversation: 'Nexus Communication'
};

export default function SettingsPage() {
  const { user } = useUser();
  const { toast } = useToast();

  const { data: settingsData, loading } = useDoc<SystemSettings>(null);
  const settings = settingsData || DEFAULT_SETTINGS;

  const [envStatus, setEnvStatus] = useState({
    google: false,
    openai: false,
    anthropic: false,
    aws: false
  });

  const [envStatusFetched, setEnvStatusFetched] = useState(false);

  useEffect(() => {
    fetch('/api/providers')
      .then(res => res.json())
      .then(data => {
        setEnvStatus(data);
        setEnvStatusFetched(true);
      })
      .catch(() => {
        setEnvStatusFetched(true);
      });
  }, []);

  const updateSettings = (updates: Partial<SystemSettings>) => {
    if (!user) return;
    const newSettings = { ...settings, ...updates };
    saveSystemSettings(null as any, user.uid, newSettings);
  };

  const updateModelMapping = (task: keyof SystemSettings['modelMapping'], modelId: string) => {
    const newMapping = { ...settings.modelMapping, [task]: modelId };
    updateSettings({ modelMapping: newMapping });

    const taskName = TASK_LABELS[task] || task;
    const modelName = AVAILABLE_MODELS.find(m => m.id === modelId)?.label || modelId;

    toast({
      title: "Core Configuration Synchronized",
      description: `Cognitive module for ${taskName} set to ${modelName}.`,
    });
  };

  if (loading || !envStatusFetched) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin size-8 border-4 border-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground animate-pulse font-mono text-xs uppercase tracking-widest">Synchronizing Nexus Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Settings2 className="size-8 text-accent" />
          <h1 className="text-4xl font-bold tracking-tighter">Laboratory Core</h1>
        </div>
        <p className="text-muted-foreground text-lg">Master orchestration of cognitive providers and system security.</p>
      </header>

      <Tabs defaultValue="models" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-12 gap-8">
          <TabsTrigger value="models" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-sm font-bold tracking-widest uppercase">Model Orchestration</TabsTrigger>
          <TabsTrigger value="security" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-sm font-bold tracking-widest uppercase">Security</TabsTrigger>
          <TabsTrigger value="infra" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-sm font-bold tracking-widest uppercase">Infrastructure</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-10 mt-10">
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Cloud className="size-5 text-accent" />
                Cognitive Provider Activation
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] text-accent border-accent/30 bg-accent/10">Module Access</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { id: 'google', name: 'Google Gemini', desc: 'PRIMARY MULTIMODAL ENGINE', icon: BrainCircuit },
                { id: 'openai', name: 'OpenAI GPT-4o', desc: 'LOGIC AND REASONING LEADER', icon: Sparkles },
                { id: 'anthropic', name: 'Anthropic Claude', desc: 'STRATEGIC NUANCE & CONTEXT', icon: Zap },
                { id: 'aws', name: 'AWS Bedrock', desc: 'ENTERPRISE INFRASTRUCTURE', icon: Cpu },
              ].map((provider) => (
                <Card key={provider.id} className="glass-panel hover:border-accent/30 transition-all border border-border">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-xl bg-secondary/50 flex items-center justify-center">
                        <provider.icon className={`size-5 ${settings.providers?.[provider.id as keyof SystemSettings['providers']] ? 'text-accent' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm tracking-tight">{provider.name}</h4>
                        <p className="text-[9px] text-muted-foreground font-bold tracking-widest uppercase">{provider.desc}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Switch
                        checked={settings.providers?.[provider.id as keyof SystemSettings['providers']] || false}
                        disabled={!envStatus[provider.id as keyof typeof envStatus]}
                        onCheckedChange={(val) => {
                          const newProviders = { ...(settings.providers || DEFAULT_SETTINGS.providers), [provider.id]: val };
                          updateSettings({ providers: newProviders });
                        }}
                        className="data-[state=checked]:bg-accent"
                      />
                      {!envStatus[provider.id as keyof typeof envStatus] && (
                        <span className="text-[8px] text-destructive uppercase tracking-widest mt-1">Missing Keys</span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ArrowRightLeft className="size-5 text-accent" />
                Global task assignments
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] text-accent border-accent/30">Active Pipeline</Badge>
            </div>

            <Card className="glass-panel overflow-hidden">
              <div className="p-0">
                <div className="grid grid-cols-12 bg-secondary/20 p-4 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <div className="col-span-4">Operational Task</div>
                  <div className="col-span-5">Assigned Cognitive Module</div>
                  <div className="col-span-3 text-right">Tier</div>
                </div>

                {[
                  { id: 'personaGeneration', label: 'Persona Synthesis', desc: 'Agent backgrounds and strategic objectives' },
                  { id: 'skillSynthesis', label: 'Skill Architecture', desc: 'Synthesizing technical tool modules' },
                  { id: 'conversation', label: 'Nexus Communication', desc: 'Real-time agent interaction & tool execution' },
                ].map((task) => (
                  <div key={task.id} className="grid grid-cols-12 p-4 items-center border-b border-border/50 hover:bg-accent/5 transition-colors">
                    <div className="col-span-4">
                      <p className="text-sm font-bold">{task.label}</p>
                      <p className="text-[10px] text-muted-foreground">{task.desc}</p>
                    </div>
                    <div className="col-span-5">
                      <Select
                        value={settings.modelMapping[task.id as keyof SystemSettings['modelMapping']]}
                        onValueChange={(val) => updateModelMapping(task.id as keyof SystemSettings['modelMapping'], val)}
                      >
                        <SelectTrigger className="bg-transparent border-accent/20 h-9 font-mono text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_MODELS.filter(m => envStatus[m.provider as keyof typeof envStatus]).map(m => (
                            <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 text-right">
                      {settings.modelMapping[task.id as keyof SystemSettings['modelMapping']].includes('pro') ||
                        settings.modelMapping[task.id as keyof SystemSettings['modelMapping']].includes('sonnet') ||
                        settings.modelMapping[task.id as keyof SystemSettings['modelMapping']].includes('gpt-4o') ? (
                        <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 text-[9px]">High Depth</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-secondary text-muted-foreground border-border text-[9px]">Optimized</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="security" className="space-y-8 mt-10">
          <Card className="glass-panel border-destructive/20 overflow-hidden">
            <CardHeader className="bg-destructive/5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="size-5 text-destructive" />
                  Cognitive Kill Switch
                </CardTitle>
                <Badge variant="destructive" className="font-mono text-[10px]">Active Protocol</Badge>
              </div>
              <CardDescription>Immediately terminate all active laboratory cognitive flows.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/10 border border-border">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">System Wide Active</Label>
                  <p className="text-xs text-muted-foreground">Master toggle for all autonomous inference.</p>
                </div>
                <Switch
                  checked={!settings.globalKillSwitch}
                  onCheckedChange={(val) => updateSettings({ globalKillSwitch: !val })}
                  className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-destructive"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infra" className="space-y-8 mt-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Core Engine', value: 'Nexus Unified Protocol', icon: Cpu, action: 'Restart Engine Framework' },
              { label: 'Data Security', value: 'Isolated User Storage', icon: Globe, action: 'Flush Local Storage Cache' },
              { label: 'Latency Zone', value: 'Edge-Optimized', icon: Cloud, action: 'Ping Relay Endpoints' },
            ].map((item, idx) => (
              <Card key={idx} className="glass-panel text-center p-6 border-accent/10 hover:border-accent/40 cursor-pointer transition-all active:scale-95 group" onClick={() => toast({ title: "Infrastructure Command", description: `Executing: ${item.action}...` })}>
                <div className="size-10 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-4 text-accent group-hover:scale-110 transition-transform">
                  <item.icon className="size-5" />
                </div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{item.label}</h4>
                <p className="text-sm font-bold">{item.value}</p>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
