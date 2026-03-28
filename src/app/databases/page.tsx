"use client";

import { useState } from "react";
import { Database, Plus, Trash2, Loader2, CheckCircle2, XCircle, Edit, Server, Shield, HardDrive, TestTube2 } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { saveDatabase, deleteDatabase, DatabaseConnection } from "@/lib/store";
import { useUser } from "@/hooks/use-user";
import { useCollection } from "@/hooks/use-collection";

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432, icon: Database },
  { value: 'mysql', label: 'MySQL / MariaDB', defaultPort: 3306, icon: Database },
  { value: 'mssql', label: 'Microsoft SQL Server', defaultPort: 1433, icon: Server },
  { value: 'mongodb', label: 'MongoDB', defaultPort: 27017, icon: Database },
  { value: 'oracle', label: 'Oracle Database', defaultPort: 1521, icon: Shield },
  { value: 'sqlite', label: 'SQLite', defaultPort: 0, icon: HardDrive },
];

const DB_SUPPORT: Record<string, 'full' | 'soon'> = {
  postgresql: 'full', mysql: 'full', mssql: 'soon', mongodb: 'soon', oracle: 'soon', sqlite: 'soon',
};

const emptyForm = (): Partial<DatabaseConnection> & { useConnectionString: boolean } => ({
  name: '', type: 'postgresql', host: 'localhost', port: 5432,
  database: '', username: '', password: '', connectionString: '',
  ssl: false, readOnly: true, useConnectionString: false,
});

export default function DatabasesPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: connections = [], loading } = useCollection<DatabaseConnection>(null, 'databases');

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<DatabaseConnection | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const update = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setIsOpen(true);
  };

  const openEdit = (conn: DatabaseConnection) => {
    setEditing(conn);
    setForm({ ...conn, useConnectionString: !!conn.connectionString, password: '', connectionString: '' });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name?.trim() || !form.type) {
      toast({ title: "Required", description: "Name and type are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const conn: DatabaseConnection = {
        id: editing ? editing.id : Math.random().toString(36).substring(7),
        name: form.name!,
        type: form.type as any,
        host: form.useConnectionString ? undefined : (form.host || undefined),
        port: form.useConnectionString ? undefined : (form.port || undefined),
        database: form.useConnectionString ? undefined : (form.database || undefined),
        username: form.useConnectionString ? undefined : (form.username || undefined),
        password: form.useConnectionString ? undefined : (form.password || undefined),
        connectionString: form.useConnectionString ? (form.connectionString || undefined) : undefined,
        ssl: form.ssl,
        readOnly: form.readOnly !== false,
      };
      await saveDatabase(conn);
      setIsOpen(false);
      toast({ title: editing ? "Connection Updated" : "Connection Added", description: `"${conn.name}" saved successfully.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (conn: DatabaseConnection) => {
    await deleteDatabase(conn.id);
    toast({ title: "Removed", description: `"${conn.name}" disconnected.` });
  };

  const handleTest = async (conn: DatabaseConnection) => {
    setTestingId(conn.id);
    try {
      const res = await fetch('/api/db-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: conn.id }),
      });
      const json = await res.json();
      if (json.success) {
        setTestResults(prev => ({ ...prev, [conn.id]: { ok: true, msg: json.message } }));
        toast({ title: "Connection OK", description: json.message });
      } else {
        setTestResults(prev => ({ ...prev, [conn.id]: { ok: false, msg: json.error } }));
        toast({ title: "Connection Failed", description: json.error, variant: "destructive" });
      }
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [conn.id]: { ok: false, msg: e.message } }));
    } finally {
      setTestingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="outline" className="border-accent/30 text-accent px-3 py-1 uppercase tracking-widest text-[10px] font-bold">
            Data Sources
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tighter">Database Connections</h1>
          <p className="text-muted-foreground sm:text-lg max-w-2xl">
            Connect external databases and give agents live query access during conversations.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="lg" className="gradient-copper shadow-xl shadow-accent/20 h-12 px-8" onClick={openNew}>
              <Plus className="mr-2 size-5" /> Add Connection
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-panel border-accent/20 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="size-5 text-accent" />
                {editing ? "Edit Connection" : "Add Database Connection"}
              </DialogTitle>
              <DialogDescription>Configure connection details. Credentials are stored encrypted in your database.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Connection Name</Label>
                  <Input placeholder="e.g. Production DB" value={form.name || ''} onChange={e => update({ name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-widest font-bold">Database Type</Label>
                  <Select value={form.type as string} onValueChange={v => {
                    const dt = DB_TYPES.find(d => d.value === v);
                    update({ type: v as any, port: dt?.defaultPort });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DB_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            {t.label}
                            {DB_SUPPORT[t.value] === 'soon' && <Badge variant="outline" className="text-[8px] ml-1">Soon</Badge>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Tabs value={form.useConnectionString ? 'string' : 'fields'} onValueChange={v => update({ useConnectionString: v === 'string' })}>
                <TabsList className="h-8">
                  <TabsTrigger value="fields" className="text-xs h-7">Fields</TabsTrigger>
                  <TabsTrigger value="string" className="text-xs h-7">Connection String</TabsTrigger>
                </TabsList>
                <TabsContent value="fields" className="space-y-4 mt-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest font-bold">Host</Label>
                      <Input placeholder="localhost" value={form.host || ''} onChange={e => update({ host: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest font-bold">Port</Label>
                      <Input type="number" value={form.port || ''} onChange={e => update({ port: parseInt(e.target.value) || undefined })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest font-bold">Database</Label>
                      <Input placeholder="mydb" value={form.database || ''} onChange={e => update({ database: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest font-bold">Username</Label>
                      <Input placeholder="admin" value={form.username || ''} onChange={e => update({ username: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest font-bold">Password</Label>
                      <Input type="password" placeholder={editing ? "Leave blank to keep" : "••••••"} value={form.password || ''} onChange={e => update({ password: e.target.value })} />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="string" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest font-bold">Connection String</Label>
                    <Input
                      type="password"
                      placeholder="postgresql://user:pass@host:5432/dbname"
                      value={form.connectionString || ''}
                      onChange={e => update({ connectionString: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-secondary/10 border border-border">
                <div className="flex items-center justify-between flex-1">
                  <div>
                    <Label className="text-sm font-bold">Use SSL / TLS</Label>
                    <p className="text-xs text-muted-foreground">Encrypt the connection</p>
                  </div>
                  <Switch checked={form.ssl || false} onCheckedChange={v => update({ ssl: v })} className="data-[state=checked]:bg-accent" />
                </div>
                <div className="w-px bg-border hidden sm:block" />
                <div className="flex items-center justify-between flex-1">
                  <div>
                    <Label className="text-sm font-bold">Read-only Mode</Label>
                    <p className="text-xs text-muted-foreground">SELECT queries only</p>
                  </div>
                  <Switch checked={form.readOnly !== false} onCheckedChange={v => update({ readOnly: v })} className="data-[state=checked]:bg-green-500" />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gradient-copper min-w-[140px]">
                {saving ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
                {editing ? "Save Changes" : "Add Connection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="animate-spin size-8 text-accent" /></div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-border rounded-2xl bg-secondary/5 text-center">
          <Database className="size-16 mb-6 text-muted-foreground opacity-10" />
          <h3 className="text-2xl font-bold mb-2">No Connections Yet</h3>
          <p className="text-muted-foreground mb-8 max-w-sm">Add your first database connection to give agents live data access during chat.</p>
          <Button onClick={openNew} className="gradient-copper h-12 px-10"><Plus className="size-4 mr-2" />Add Connection</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {connections.map((conn) => {
            const dbType = DB_TYPES.find(d => d.value === conn.type);
            const test = testResults[conn.id];
            const isSupported = DB_SUPPORT[conn.type] === 'full';
            return (
              <Card key={conn.id} className="glass-panel group relative overflow-hidden transition-all hover:border-accent/40">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className={`p-2.5 rounded-xl border ${isSupported ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-muted/50 border-border text-muted-foreground'}`}>
                      <Database className="size-5" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-accent" onClick={() => openEdit(conn)}>
                        <Edit className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => handleDelete(conn)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-lg font-bold tracking-tight truncate">{conn.name}</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-mono bg-secondary/50">{dbType?.label || conn.type}</Badge>
                    {conn.readOnly && <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-500">Read-only</Badge>}
                    {conn.ssl && <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">SSL</Badge>}
                    {!isSupported && <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-500">Coming soon</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="text-xs text-muted-foreground space-y-1 font-mono">
                    {conn.host && <div className="truncate">host: {conn.host}{conn.port ? `:${conn.port}` : ''}</div>}
                    {conn.database && <div className="truncate">db: {conn.database}</div>}
                    {conn.username && <div className="truncate">user: {conn.username}</div>}
                    {!conn.host && !conn.database && <div className="italic">Connection string configured</div>}
                  </div>
                  {test && (
                    <div className={`mt-3 flex items-center gap-2 text-xs p-2 rounded-lg ${test.ok ? 'bg-green-500/10 text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                      {test.ok ? <CheckCircle2 className="size-3 shrink-0" /> : <XCircle className="size-3 shrink-0" />}
                      <span className="truncate">{test.msg}</span>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="border-t border-border/50 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs border-accent/20 hover:border-accent/40 hover:text-accent"
                    onClick={() => handleTest(conn)}
                    disabled={testingId === conn.id || !isSupported}
                  >
                    {testingId === conn.id
                      ? <Loader2 className="size-3 animate-spin mr-1.5" />
                      : <TestTube2 className="size-3 mr-1.5" />}
                    {testingId === conn.id ? 'Testing...' : isSupported ? 'Test Connection' : 'Not yet supported'}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
