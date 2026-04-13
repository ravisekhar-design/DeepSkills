"use client";

import { useState, useEffect, useRef } from "react";
import { Database, Plus, Trash2, Loader2, CheckCircle2, XCircle, Edit, Server, Shield, HardDrive, TestTube2, FolderOpen, FolderPlus, Upload, ChevronLeft, FileText, FileCode, Table, Eye } from "lucide-react";
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
import { saveDatabase, deleteDatabase, DatabaseConnection, FileFolder, FileRecord } from "@/lib/store";
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

const ACCEPTED_TYPES = '.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.html,.xml,.yaml,.yml,.sql,.log,.env,.toml,.ini,.cfg';

const fileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['csv', 'tsv'].includes(ext)) return <Table className="size-4 text-green-400 shrink-0" />;
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'sql'].includes(ext)) return <FileCode className="size-4 text-blue-400 shrink-0" />;
  return <FileText className="size-4 text-accent shrink-0" />;
};

const formatBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

const emptyForm = (): Partial<DatabaseConnection> & { useConnectionString: boolean } => ({
  name: '', type: 'postgresql', host: 'localhost', port: 5432,
  database: '', username: '', password: '', connectionString: '',
  ssl: false, readOnly: true, useConnectionString: false,
});

export default function DatabasesPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: connections = [], loading } = useCollection<DatabaseConnection>(null, 'databases');

  // ── DB state ────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<DatabaseConnection | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // ── File storage state ──────────────────────────────────────────────────
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [openFolder, setOpenFolder] = useState<FileFolder | null>(null);
  const [folderFiles, setFolderFiles] = useState<FileRecord[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewingFile, setViewingFile] = useState<{ id: string; name: string; content: string; mimeType: string; size: number } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  // ── Load folders ────────────────────────────────────────────────────────
  const loadFolders = async () => {
    if (!user) return;
    setFoldersLoading(true);
    try {
      const res = await fetch('/api/files?type=folders');
      const json = await res.json();
      setFolders(json.data || []);
    } catch { /* non-fatal */ }
    setFoldersLoading(false);
  };

  useEffect(() => { loadFolders(); }, [user?.uid]);

  // ── Load files for open folder ──────────────────────────────────────────
  const openFolderView = async (folder: FileFolder) => {
    setOpenFolder(folder);
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/files?type=files&folderId=${folder.id}`);
      const json = await res.json();
      setFolderFiles(json.data || []);
    } catch { /* non-fatal */ }
    setFilesLoading(false);
  };

  // ── Create folder ───────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'folder', name: newFolderName.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setFolders(prev => [json.data, ...prev]);
        setNewFolderName('');
        setNewFolderOpen(false);
        toast({ title: 'Folder Created', description: `"${json.data.name}" is ready for uploads.` });
      } else {
        toast({ title: 'Error', description: json.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setCreatingFolder(false);
  };

  // ── Delete folder ───────────────────────────────────────────────────────
  const handleDeleteFolder = async (folder: FileFolder) => {
    try {
      await fetch(`/api/files?type=folder&id=${folder.id}`, { method: 'DELETE' });
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      if (openFolder?.id === folder.id) setOpenFolder(null);
      toast({ title: 'Folder Deleted', description: `"${folder.name}" and all its files removed.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── Upload file(s) ──────────────────────────────────────────────────────
  // Files ≤ 3.5 MB → single request.
  // Files > 3.5 MB → chunked upload (3 MB chunks) to stay under Vercel's
  //                  4.5 MB request body limit per request.
  // No upper bound enforced client-side — files of any size are supported.
  const SINGLE_UPLOAD_LIMIT = 3.5 * 1024 * 1024;  // 3.5 MB
  const CHUNK_SIZE           = 3   * 1024 * 1024;  // 3 MB per chunk

  const safeJson = async (res: Response): Promise<any> => {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { error: `HTTP ${res.status}: ${text.slice(0, 120)}` }; }
  };

  const uploadChunked = async (file: File, content: string): Promise<any> => {
    const totalChunks = Math.ceil(content.length / CHUNK_SIZE);
    // 1. Start
    const startRes = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'file-start', folderId: openFolder!.id, name: file.name, mimeType: file.type || 'text/plain', totalSize: file.size, totalChunks }),
    });
    const startJson = await safeJson(startRes);
    if (!startJson.data?.id) throw new Error(startJson.error || 'Failed to start upload');
    const fileId = startJson.data.id;

    // 2. Upload chunks
    for (let c = 0; c < totalChunks; c++) {
      const chunk = content.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
      const chunkRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'file-chunk', fileId, idx: c, content: chunk }),
      });
      const chunkJson = await safeJson(chunkRes);
      if (!chunkJson.success) throw new Error(chunkJson.error || `Chunk ${c} failed`);
    }

    // 3. Finalize
    const finalRes = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'file-finalize', fileId }),
    });
    const finalJson = await safeJson(finalRes);
    if (!finalJson.data) throw new Error(finalJson.error || 'Finalize failed');
    return finalJson.data;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !openFolder) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });

    let succeeded = 0;
    const failures: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await file.text();
        let fileData: any;

        if (file.size <= SINGLE_UPLOAD_LIMIT) {
          // Single-request upload
          const res = await fetch('/api/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'file', folderId: openFolder.id, name: file.name, content, mimeType: file.type || 'text/plain' }),
          });
          const json = await safeJson(res);
          if (!json.data) {
            const msg = res.status === 413
              ? `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Use chunked upload.`
              : json.error || 'unknown error';
            failures.push(`${file.name}: ${msg}`);
            setUploadProgress({ done: i + 1, total: files.length });
            continue;
          }
          fileData = json.data;
        } else {
          // Chunked upload for large files
          fileData = await uploadChunked(file, content);
        }

        setFolderFiles(prev => [...prev, fileData]);
        succeeded++;
      } catch (err: any) {
        failures.push(`${file.name}: ${err.message}`);
      }
      setUploadProgress({ done: i + 1, total: files.length });
    }

    if (succeeded > 0) {
      setFolders(prev => prev.map(f =>
        f.id === openFolder.id ? { ...f, fileCount: (f.fileCount ?? 0) + succeeded } : f
      ));
      toast({
        title: `${succeeded} file${succeeded !== 1 ? 's' : ''} uploaded`,
        description: `Added to ${openFolder.name}.`,
      });
    }
    if (failures.length) {
      toast({
        title: `${failures.length} upload${failures.length !== 1 ? 's' : ''} failed`,
        description: failures.slice(0, 3).join('\n') + (failures.length > 3 ? `\n…and ${failures.length - 3} more` : ''),
        variant: 'destructive',
      });
    }

    setUploading(false);
    setUploadProgress(null);
  };

  // ── View file ───────────────────────────────────────────────────────────
  const handleViewFile = async (file: FileRecord) => {
    setViewerLoading(true);
    setViewingFile({ id: file.id, name: file.name, content: '', mimeType: file.mimeType, size: file.size });
    try {
      const res = await fetch(`/api/files?type=content&fileId=${file.id}`);
      const json = await res.json();
      if (json.data) {
        setViewingFile({
          id: json.data.id,
          name: json.data.name,
          content: json.data.content ?? '',
          mimeType: json.data.mimeType || file.mimeType,
          size: file.size,
        });
      } else {
        toast({ title: 'Load Failed', description: json.error, variant: 'destructive' });
        setViewingFile(null);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setViewingFile(null);
    }
    setViewerLoading(false);
  };

  // ── Delete file ─────────────────────────────────────────────────────────
  const handleDeleteFile = async (file: FileRecord) => {
    try {
      await fetch(`/api/files?type=file&id=${file.id}`, { method: 'DELETE' });
      setFolderFiles(prev => prev.filter(f => f.id !== file.id));
      setFolders(prev => prev.map(f =>
        f.id === openFolder?.id ? { ...f, fileCount: Math.max(0, (f.fileCount ?? 1) - 1) } : f
      ));
      toast({ title: 'File Removed', description: `"${file.name}" deleted.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── DB handlers ─────────────────────────────────────────────────────────
  const openNew = () => { setEditing(null); setForm(emptyForm()); setIsOpen(true); };
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
      toast({ title: editing ? "Connection Updated" : "Connection Added", description: `"${conn.name}" saved.` });
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
      <header className="space-y-2">
        <Badge variant="outline" className="border-accent/30 text-accent px-3 py-1 uppercase tracking-widest text-[10px] font-bold">
          Data Sources
        </Badge>
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tighter">Databases & File Storage</h1>
        <p className="text-muted-foreground sm:text-lg max-w-2xl">
          Connect databases for live queries, or upload files that agents can read during conversations.
        </p>
      </header>

      <Tabs defaultValue="databases">
        <TabsList className="mb-6 h-11 bg-secondary/20 border border-border">
          <TabsTrigger value="databases" className="gap-2 data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
            <Database className="size-4" /> Databases
            {connections.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{connections.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2 data-[state=active]:bg-accent/20 data-[state=active]:text-accent">
            <FolderOpen className="size-4" /> File Storage
            {folders.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{folders.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Databases tab ──────────────────────────────────────────────── */}
        <TabsContent value="databases" className="space-y-6">
          <div className="flex justify-end">
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
                  <DialogDescription>Configure connection details. Credentials are stored encrypted.</DialogDescription>
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
                        <Input type="password" placeholder="postgresql://user:pass@host:5432/dbname" value={form.connectionString || ''} onChange={e => update({ connectionString: e.target.value })} className="font-mono text-xs" />
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
          </div>

          {loading ? (
            <div className="flex justify-center py-24"><Loader2 className="animate-spin size-8 text-accent" /></div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-border rounded-2xl bg-secondary/5 text-center">
              <Database className="size-16 mb-6 text-muted-foreground opacity-10" />
              <h3 className="text-2xl font-bold mb-2">No Connections Yet</h3>
              <p className="text-muted-foreground mb-8 max-w-sm">Add your first database to give agents live data access during chat.</p>
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
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs border-accent/20 hover:border-accent/40 hover:text-accent" onClick={() => handleTest(conn)} disabled={testingId === conn.id || !isSupported}>
                        {testingId === conn.id ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <TestTube2 className="size-3 mr-1.5" />}
                        {testingId === conn.id ? 'Testing...' : isSupported ? 'Test Connection' : 'Not yet supported'}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── File Storage tab ───────────────────────────────────────────── */}
        <TabsContent value="files" className="space-y-6">
          {/* hidden file input */}
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_TYPES} className="hidden" onChange={handleFileUpload} />

          {openFolder ? (
            /* ── Folder view ──────────────────────────────────────────── */
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setOpenFolder(null)}>
                    <ChevronLeft className="size-4" /> All Folders
                  </Button>
                  <div className="w-px h-5 bg-border" />
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-4 text-accent" />
                    <span className="font-bold text-sm">{openFolder.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}</Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gradient-copper h-9 px-5 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {uploading
                    ? uploadProgress
                      ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
                      : 'Uploading...'
                    : 'Upload Files'}
                </Button>
              </div>

              <div className="p-3 rounded-xl bg-accent/5 border border-accent/10 text-[11px] text-muted-foreground">
                Supported: <span className="font-mono text-accent/80">.txt .md .csv .json .ts .js .py .html .xml .yaml .sql .log</span> — large files use chunked upload automatically. Files are injected into the agent's context when it responds.
              </div>

              {filesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin size-6 text-accent" /></div>
              ) : folderFiles.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-2xl bg-secondary/5 text-center cursor-pointer hover:border-accent/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-12 mb-4 text-muted-foreground opacity-20" />
                  <p className="text-sm font-bold mb-1">Click to upload one or more files</p>
                  <p className="text-xs text-muted-foreground">Text, CSV, JSON, code files — any size</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {folderFiles.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-secondary/10 border border-border hover:border-accent/30 transition-colors group cursor-pointer"
                      onClick={() => handleViewFile(file)}
                    >
                      {fileIcon(file.name)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono shrink-0 hidden sm:flex">
                        {file.name.split('.').pop()?.toUpperCase()}
                      </Badge>
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => { e.stopPropagation(); handleViewFile(file); }}
                        title="View contents"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => { e.stopPropagation(); handleDeleteFile(file); }}
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Folder list ──────────────────────────────────────────── */
            <div className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gradient-copper shadow-xl shadow-accent/20 h-12 px-8">
                      <FolderPlus className="mr-2 size-5" /> New Folder
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-panel border-accent/20 sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FolderPlus className="size-5 text-accent" /> Create Folder
                      </DialogTitle>
                      <DialogDescription>Group related files together for easy assignment to agents.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                      <Label className="text-[10px] uppercase tracking-widest font-bold">Folder Name</Label>
                      <Input
                        placeholder="e.g. Product Docs, Q4 Reports"
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                        autoFocus
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()} className="gradient-copper min-w-[120px]">
                        {creatingFolder ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
                        Create
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {foldersLoading ? (
                <div className="flex justify-center py-24"><Loader2 className="animate-spin size-8 text-accent" /></div>
              ) : folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-border rounded-2xl bg-secondary/5 text-center">
                  <FolderOpen className="size-16 mb-6 text-muted-foreground opacity-10" />
                  <h3 className="text-2xl font-bold mb-2">No Folders Yet</h3>
                  <p className="text-muted-foreground mb-8 max-w-sm">Create a folder, upload files, then assign it to an agent so it can answer questions from your data.</p>
                  <Button onClick={() => setNewFolderOpen(true)} className="gradient-copper h-12 px-10">
                    <FolderPlus className="size-4 mr-2" /> Create First Folder
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {folders.map(folder => (
                    <Card
                      key={folder.id}
                      className="glass-panel group cursor-pointer hover:border-accent/40 transition-all"
                      onClick={() => openFolderView(folder)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
                            <FolderOpen className="size-5 text-accent" />
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => { e.stopPropagation(); handleDeleteFolder(folder); }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        <p className="font-bold text-sm truncate mb-1">{folder.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {folder.fileCount ?? 0} file{folder.fileCount !== 1 ? 's' : ''}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── File Viewer Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!viewingFile} onOpenChange={v => { if (!v) setViewingFile(null); }}>
        <DialogContent className="glass-panel border-accent/20 sm:max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              {viewingFile && fileIcon(viewingFile.name)}
              <span className="truncate">{viewingFile?.name}</span>
              {viewingFile && (
                <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                  {formatBytes(viewingFile.size)}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewingFile?.mimeType || 'text/plain'} — read-only preview
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 rounded-xl border border-border bg-black/40 overflow-hidden">
            {viewerLoading ? (
              <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin size-6 text-accent" /></div>
            ) : (
              <pre className="text-xs font-mono text-foreground/90 p-4 overflow-auto h-full max-h-[60vh] whitespace-pre-wrap break-words">
                {viewingFile?.content || <span className="text-muted-foreground italic">Empty file</span>}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingFile(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
