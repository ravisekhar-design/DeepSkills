"use client";

import {
  Settings2,
  ShieldAlert,
  Cpu,
  Cloud,
  ArrowRightLeft,
  Key,
  BrainCircuit,
  Sparkles,
  Zap,
  Save,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { saveSystemSettings, SystemSettings, DEFAULT_SETTINGS } from "@/lib/store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/hooks/use-user";
import { useDoc } from "@/hooks/use-doc";
import { useEffect, useState } from "react";

const AVAILABLE_MODELS = [
  { id: 'googleai/gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'googleai/gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', provider: 'google' },
  { id: 'googleai/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'anthropic/claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'anthropic' },
  { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'anthropic' },
  { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)', provider: 'groq' },
  { id: 'groq/llama-3.1-70b-versatile', label: 'Llama 3.1 70B (Groq)', provider: 'groq' },
  { id: 'groq/mixtral-8x7b-32768', label: 'Mixtral 8x7B (Groq)', provider: 'groq' },
  { id: 'groq/llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Groq)', provider: 'groq' },
  { id: 'mistral/mistral-large-latest', label: 'Mistral Large', provider: 'mistral' },
  { id: 'mistral/mistral-small-latest', label: 'Mistral Small', provider: 'mistral' },
  { id: 'mistral/open-mixtral-8x22b', label: 'Mixtral 8x22B (Mistral)', provider: 'mistral' },
];

const TASK_LABELS: Record<string, string> = {
  personaGeneration: 'Persona Synthesis',
  skillSynthesis: 'Skill Architecture',
  conversation: 'Agent Conversation',
  visualize: 'Visualize',
};

function ApiKeyDialog({
  title, description, icon: Icon, fields, savedKeys, onSave,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  fields: { id: string; label: string; placeholder: string; key: string }[];
  savedKeys: Record<string, string | undefined> | undefined;
  onSave: (values: Record<string, string>) => void;
}) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  const isConfigured = fields.every(f => !!(savedKeys?.[f.key]));

  const handleOpen = (val: boolean) => {
    if (val) {
      const initial: Record<string, string> = {};
      fields.forEach(f => { initial[f.key as string] = savedKeys?.[f.key] || ''; });
      setLocalValues(initial);
    }
    setOpen(val);
  };

  const handleSave = () => {
    onSave(localValues);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Card className="glass-panel hover:border-accent/40 cursor-pointer transition-all border border-border group h-full">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4 h-full">
            <div className="size-12 rounded-2xl bg-secondary flex items-center justify-center group-hover:scale-110 group-hover:bg-accent/10 transition-all">
              <Icon className="size-6 text-muted-foreground group-hover:text-accent transition-colors" />
            </div>
            <div>
              <h4 className="font-bold">{title}</h4>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                {isConfigured ? 'Key Configured' : 'No Key'}
              </p>
            </div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-border glass-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-accent" />
            {title} Credentials
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {fields.map(f => (
            <div key={f.id} className="space-y-2">
              <Label htmlFor={f.id}>{f.label}</Label>
              <Input
                id={f.id}
                type="password"
                value={localValues[f.key as string] || ''}
                placeholder={f.placeholder}
                onChange={(e) => setLocalValues(prev => ({ ...prev, [f.key as string]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} className="gradient-copper">
            <Save className="size-4 mr-2" /> Save Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { toast } = useToast();

  const { data: settingsData, loading } = useDoc<SystemSettings>(null);
  // Deep-merge with defaults so newly added keys (e.g. visualize) are always present
  // even when older saved settings don't have them yet.
  const settings: SystemSettings = settingsData ? {
    ...DEFAULT_SETTINGS,
    ...settingsData,
    modelMapping: { ...DEFAULT_SETTINGS.modelMapping, ...settingsData.modelMapping },
    providers: { ...DEFAULT_SETTINGS.providers, ...settingsData.providers },
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...settingsData.apiKeys },
  } : DEFAULT_SETTINGS;

  const [envStatus, setEnvStatus] = useState({ google: false, openai: false, anthropic: false, aws: false, groq: false, mistral: false });
  const [envStatusFetched, setEnvStatusFetched] = useState(false);

  useEffect(() => {
    fetch('/api/providers')
      .then(res => res.json())
      .then(data => { setEnvStatus(data); setEnvStatusFetched(true); })
      .catch(() => setEnvStatusFetched(true));
  }, []);

  const updateSettings = (updates: Partial<SystemSettings>) => {
    if (!user) return;
    saveSystemSettings({ ...settings, ...updates });
  };

  const updateModelMapping = (task: keyof SystemSettings['modelMapping'], modelId: string) => {
    updateSettings({ modelMapping: { ...settings.modelMapping, [task]: modelId } });
    toast({ title: "Model Updated", description: `${TASK_LABELS[task]} set to ${AVAILABLE_MODELS.find(m => m.id === modelId)?.label || modelId}.` });
  };

  const saveApiKeys = (providerKeys: Partial<SystemSettings['apiKeys']>) => {
    updateSettings({ apiKeys: { ...settings.apiKeys, ...providerKeys } });
    toast({ title: "API Key Saved", description: "Credentials updated successfully." });
  };

  if (loading || !envStatusFetched) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin size-8 border-4 border-accent border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground animate-pulse font-mono text-xs uppercase tracking-widest">Loading Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-10 pb-20">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Settings2 className="size-8 text-accent" />
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tighter">Settings</h1>
        </div>
        <p className="text-muted-foreground sm:text-lg">Configure AI providers, API keys, and system preferences.</p>
      </header>

      <Tabs defaultValue="models" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-12 gap-4 sm:gap-8 overflow-x-auto">
          <TabsTrigger value="models" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-sm font-bold tracking-widest uppercase">Models</TabsTrigger>
          <TabsTrigger value="security" className="rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-accent text-sm font-bold tracking-widest uppercase">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-10 mt-10">
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Cloud className="size-5 text-accent" />
                AI Providers
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] text-accent border-accent/30 bg-accent/10">Active Providers</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { id: 'google', name: 'Google Gemini', desc: 'Gemini 2.0/1.5 family', icon: BrainCircuit },
                { id: 'openai', name: 'OpenAI', desc: 'GPT-4o family', icon: Sparkles },
                { id: 'anthropic', name: 'Anthropic', desc: 'Claude 3.5/4.x family', icon: Zap },
                { id: 'groq', name: 'Groq', desc: 'Llama & Mixtral — ultra-fast', icon: Cpu },
                { id: 'mistral', name: 'Mistral AI', desc: 'Mistral Large & Small', icon: ArrowRightLeft },
                { id: 'aws', name: 'AWS Bedrock', desc: 'Enterprise cloud models', icon: Cpu },
              ].map((provider) => (
                <Card key={provider.id} className="glass-panel hover:border-accent/30 transition-all border border-border">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-xl bg-secondary/50 flex items-center justify-center">
                        <provider.icon className={`size-5 ${settings.providers?.[provider.id as keyof SystemSettings['providers']] ? 'text-accent' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{provider.name}</h4>
                        <p className="text-[10px] text-muted-foreground">{provider.desc}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Switch
                        checked={settings.providers?.[provider.id as keyof SystemSettings['providers']] || false}
                        disabled={!envStatus[provider.id as keyof typeof envStatus]}
                        onCheckedChange={(val) => updateSettings({ providers: { ...(settings.providers || DEFAULT_SETTINGS.providers), [provider.id]: val } })}
                        className="data-[state=checked]:bg-accent"
                      />
                      {!envStatus[provider.id as keyof typeof envStatus] && (
                        <span className="text-[8px] text-destructive uppercase tracking-widest">No API Key</span>
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
                Task Model Assignments
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] text-accent border-accent/30">Active</Badge>
            </div>

            <Card className="glass-panel overflow-hidden">
              <div className="hidden sm:grid grid-cols-12 bg-secondary/20 p-4 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <div className="col-span-4">Task</div>
                <div className="col-span-5">Model</div>
                <div className="col-span-3 text-right">Tier</div>
              </div>
              {[
                { id: 'personaGeneration', label: 'Persona Synthesis', desc: 'Agent persona generation' },
                { id: 'skillSynthesis', label: 'Skill Architecture', desc: 'Skill module generation' },
                { id: 'conversation', label: 'Agent Conversation', desc: 'Real-time chat & tool use' },
                { id: 'visualize', label: 'Visualize', desc: 'AI chart & dashboard generation' },
              ].map((task) => (
                <div key={task.id} className="flex flex-col gap-3 sm:grid sm:grid-cols-12 p-4 sm:items-center border-b border-border/50 hover:bg-accent/5 transition-colors">
                  <div className="sm:col-span-4 flex items-center justify-between sm:block">
                    <div>
                      <p className="text-sm font-bold">{task.label}</p>
                      <p className="text-[10px] text-muted-foreground">{task.desc}</p>
                    </div>
                    <div className="sm:hidden">
                      {['pro', 'sonnet', 'gpt-4o'].some(t => settings.modelMapping[task.id as keyof SystemSettings['modelMapping']].includes(t)) ? (
                        <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 text-[9px]">Pro</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-secondary text-muted-foreground border-border text-[9px]">Fast</Badge>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-5">
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
                        {AVAILABLE_MODELS.filter(m => !envStatus[m.provider as keyof typeof envStatus]).map(m => (
                          <SelectItem key={m.id} value={m.id} className="text-xs text-muted-foreground" disabled>{m.label} (no key)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="hidden sm:block sm:col-span-3 text-right">
                    {['pro', 'sonnet', 'gpt-4o'].some(t => settings.modelMapping[task.id as keyof SystemSettings['modelMapping']].includes(t)) ? (
                      <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 text-[9px]">Pro</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-secondary text-muted-foreground border-border text-[9px]">Fast</Badge>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="security" className="space-y-8 mt-10">
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Key className="size-5 text-accent" />
                API Keys
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Configure provider credentials. Keys are stored in your local database.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ApiKeyDialog
                title="Google"
                description="Unlocks Gemini models."
                icon={BrainCircuit}
                fields={[{ id: 'google-key', label: 'API Key', placeholder: 'AIzaSy...', key: 'google' }]}
                savedKeys={settings.apiKeys}
                onSave={(vals) => saveApiKeys({ google: vals.google })}
              />
              <ApiKeyDialog
                title="OpenAI"
                description="Unlocks GPT-4o models."
                icon={Sparkles}
                fields={[{ id: 'openai-key', label: 'API Key', placeholder: 'sk-proj-...', key: 'openai' }]}
                savedKeys={settings.apiKeys}
                onSave={(vals) => saveApiKeys({ openai: vals.openai })}
              />
              <ApiKeyDialog
                title="Anthropic"
                description="Unlocks Claude models."
                icon={Zap}
                fields={[{ id: 'anthropic-key', label: 'API Key', placeholder: 'sk-ant-...', key: 'anthropic' }]}
                savedKeys={settings.apiKeys}
                onSave={(vals) => saveApiKeys({ anthropic: vals.anthropic })}
              />
              <ApiKeyDialog
                title="AWS Bedrock"
                description="IAM credentials for Amazon Bedrock."
                icon={Cpu}
                fields={[
                  { id: 'aws-key', label: 'Access Key ID', placeholder: 'AKIA...', key: 'aws_access_key_id' },
                  { id: 'aws-secret', label: 'Secret Access Key', placeholder: '...', key: 'aws_secret_access_key' },
                ]}
                savedKeys={settings.apiKeys}
                onSave={(vals) => saveApiKeys({ aws_access_key_id: vals.aws_access_key_id, aws_secret_access_key: vals.aws_secret_access_key })}
              />
              <ApiKeyDialog
                title="Groq"
                description="Unlocks Llama 3.x and Mixtral at ultra-fast inference speeds."
                icon={Cpu}
                fields={[{ id: 'groq-key', label: 'API Key', placeholder: 'gsk_...', key: 'groq' }]}
                savedKeys={settings.apiKeys}
                onSave={(vals) => saveApiKeys({ groq: vals.groq })}
              />
              <ApiKeyDialog
                title="Mistral AI"
                description="Unlocks Mistral Large, Small, and Mixtral 8x22B models."
                icon={ArrowRightLeft}
                fields={[{ id: 'mistral-key', label: 'API Key', placeholder: '...', key: 'mistral' }]}
                savedKeys={settings.apiKeys}
                onSave={(vals) => saveApiKeys({ mistral: vals.mistral })}
              />
            </div>
          </div>

          <Card className="glass-panel border-destructive/20 overflow-hidden">
            <CardHeader className="bg-destructive/5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="size-5 text-destructive" />
                  Global Kill Switch
                </CardTitle>
                <Badge variant="destructive" className="font-mono text-[10px]">Safety Control</Badge>
              </div>
              <CardDescription>Disable all AI inference system-wide.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/10 border border-border">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold">AI Inference Active</Label>
                  <p className="text-xs text-muted-foreground">Master toggle for all agent inference.</p>
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
      </Tabs>
    </div>
  );
}
