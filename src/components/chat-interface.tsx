"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Agent, Skill, DEFAULT_SKILLS, DEFAULT_SETTINGS, SystemSettings, saveChat, getChat } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Zap, Terminal, Loader2, Sparkles, BrainCircuit, ListOrdered, Paperclip, X, Download } from "lucide-react";
import { agentConversationToolExecution } from "@/ai/flows/agent-conversation-tool-execution";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useCollection } from "@/hooks/use-collection";
import { useDoc } from "@/hooks/use-doc";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { logSystemEvent } from "@/lib/logger";

interface Message {
  role: 'user' | 'model';
  content: string;
  toolExecutions?: any[];
}

export default function ChatInterface({ agent }: { agent: Agent }) {
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string, content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: customSkills = [] } = useCollection<Skill>(null, 'skills');
  const { data: settingsData } = useDoc<SystemSettings>(null);
  const settings = settingsData || DEFAULT_SETTINGS;

  const allSkills = useMemo(() => {
    const customMap = new Map(customSkills.map(s => [s.id, s]));
    const mergedDefaults = DEFAULT_SKILLS.map(ds => customMap.has(ds.id) ? customMap.get(ds.id)! : ds);
    const pureCustom = customSkills.filter(cs => !DEFAULT_SKILLS.some(ds => ds.id === cs.id));
    return [...mergedDefaults, ...pureCustom];
  }, [customSkills]);

  useEffect(() => {
    const initChat = async () => {
      if (!user) return;
      const history = await getChat(user.uid, agent.id);

      if (history && history.messages.length > 0) {
        setMessages(history.messages);
      } else {
        setMessages([{
          role: 'model',
          content: `Establishing secure link with ${agent.name}... Persona initialized. My cognitive pipeline is ready with ${agent.skills?.length || 0} active modules. How can I assist you today?`
        }]);
      }
    };
    initChat();
    // Use stable primitive IDs, not object references, to prevent infinite re-render loops
  }, [agent.id, user?.uid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setAttachedFile({ name: file.name, content });
    };
    reader.onerror = () => {
      toast({
        title: "File Read Error",
        description: "Could not parse the attached file.",
        variant: "destructive"
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || isLoading) return;

    let userQuery = input;
    if (attachedFile) {
      userQuery = `${input}\n\n[Attached File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\``;
    }

    const displayQuery = input || `[Attached: ${attachedFile?.name}]`;
    const userMessage: Message = { role: 'user', content: displayQuery };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setAttachedFile(null);
    setIsLoading(true);

    try {
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'model')
        .map(m => ({ role: m.role, content: m.content }));

      const result = await agentConversationToolExecution({
        query: userQuery,
        chatHistory: history,
        availableSkills: agent.skills,
        preferredModel: settings.modelMapping.conversation
      });

      const botMessage: Message = {
        role: 'model',
        content: result.response,
        toolExecutions: result.toolExecutions
      };

      setMessages(prev => {
        const finalMessages = [...prev, botMessage];
        if (user) {
          saveChat(user.uid, agent.id, finalMessages);
        }
        return finalMessages;
      });
    } catch (error: any) {
      console.error("Nexus Communication Failure:", error);
      await logSystemEvent('error', 'Nexus Link Communication Failure', {
        agentId: agent.id,
        error: error.message || error.toString(),
        stack: error.stack
      });
      toast({
        title: "Nexus Link Failure",
        description: "The cognitive engine failed to respond. Check system logs.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between pl-14 pr-6 py-6 md:px-6 bg-sidebar/30 backdrop-blur-md border-b border-border shadow-sm gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg gradient-sapphire flex items-center justify-center font-bold text-accent shadow-lg shadow-accent/10">
              {agent.name.charAt(0)}
            </div>
            <div>
              <h2 className="font-bold tracking-tight">{agent.name}</h2>
              <p className="text-[10px] text-green-500 uppercase tracking-widest font-bold">Secure Link Active</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <Button
              variant={isIntelOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setIsIntelOpen(!isIntelOpen)}
              className="text-xs font-bold uppercase tracking-widest border border-transparent data-[state=open]:border-accent/30 hidden lg:flex mr-4"
            >
              <BrainCircuit className="size-4 mr-2" />
              Toggle Intel
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground"><Terminal className="size-4" /></Button>
              <div className="h-4 w-px bg-border mx-2" />
              <div className="flex -space-x-2">
                {agent.skills?.map((sId, i) => (
                  <div key={i} title={sId} className="size-6 rounded-full border border-background bg-accent/20 flex items-center justify-center">
                    <Zap className={`size-3 ${i === 0 ? 'text-accent fill-accent' : 'text-accent/60'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1 p-6 bg-[#080808]">
          <div className="max-w-3xl mx-auto space-y-8">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-accent' : 'gradient-sapphire'
                  }`}>
                  {msg.role === 'user' ? <User className="size-4 text-white" /> : <Bot className="size-4 text-accent" />}
                </div>
                <div className={`space-y-4 max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`p-4 rounded-2xl border ${msg.role === 'user'
                    ? 'bg-accent/10 border-accent/20 text-foreground'
                    : 'glass-panel text-foreground/90'
                    }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                          a: ({ node, ...props }) => <a className="text-accent hover:underline font-medium" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-2 space-y-1" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-2 space-y-1" {...props} />,
                          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6 text-foreground" {...props} />,
                          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mb-3 mt-5 text-foreground" {...props} />,
                          h3: ({ node, ...props }) => <h3 className="text-lg font-bold mb-2 mt-4 text-foreground" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-bold text-foreground" {...props} />,
                          pre: ({ node, ...props }) => <pre className="bg-background/50 border border-border p-4 rounded-lg overflow-x-auto font-mono text-sm mb-4 mt-2" {...props} />,
                          code: ({ node, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const isBlock = match || String(children).includes('\n');

                            if (isBlock) {
                              const language = match ? match[1].toLowerCase() : 'txt';
                              const codeString = String(children).replace(/\n$/, '');

                              const handleDownload = () => {
                                const extensionMap: Record<string, string> = {
                                  'javascript': 'js',
                                  'typescript': 'ts',
                                  'python': 'py',
                                  'markdown': 'md',
                                  'bash': 'sh',
                                  'shell': 'sh',
                                  'excel': 'csv'
                                };
                                const ext = extensionMap[language] || language;

                                const blob = new Blob([codeString], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `nexus_export.${ext}`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                toast({ title: "Module Exported", description: `Saved as nexus_export.${ext}` });
                              };

                              return (
                                <div className="relative group/code">
                                  <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={handleDownload}
                                      className="h-8 gap-1.5 bg-secondary/80 hover:bg-secondary text-xs shadow-sm border border-border"
                                    >
                                      <Download className="size-3" /> Export
                                    </Button>
                                  </div>
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </div>
                              );
                            }

                            return (
                              <code className="bg-secondary/50 px-1.5 py-0.5 rounded-md font-mono text-sm text-accent" {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>

                  {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                    <div className="space-y-2">
                      {msg.toolExecutions.map((exec, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/50">
                          <div className="size-8 rounded bg-primary/40 flex items-center justify-center">
                            <Zap className="size-4 text-accent" />
                          </div>
                          <div className="text-left">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-accent">Module Executed</p>
                            <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{exec.toolName}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-4">
                <div className="size-8 rounded-lg gradient-sapphire flex items-center justify-center shrink-0">
                  <Bot className="size-4 text-accent" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground p-4 bg-secondary/20 rounded-2xl italic text-sm">
                  <Loader2 className="size-4 animate-spin text-accent" />
                  Processing strategic response...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="p-6 bg-sidebar/30 backdrop-blur-md border-t border-border flex flex-col gap-3">
          {attachedFile && (
            <div className="max-w-3xl mx-auto w-full">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent">
                <Paperclip className="size-3" />
                <span className="font-medium truncate max-w-[200px]">{attachedFile.name}</span>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="ml-1 hover:bg-black/20 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          )}
          <div className="max-w-3xl mx-auto w-full flex flex-col md:flex-row gap-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
              accept=".txt,.csv,.json,.md,.js,.ts,.html,.css"
            />
            <div className="relative flex-1 order-first md:order-none">
              <Input
                placeholder="Command agent or attach data..."
                className="h-12 bg-secondary/50 border-border pr-12 focus:ring-accent"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-accent">
                  <Sparkles className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0 bg-secondary/50 border-border hover:border-accent/40"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Paperclip className="size-5 text-muted-foreground" />
              </Button>
              <Button
                className="h-12 flex-1 md:w-12 md:flex-none gradient-copper shadow-lg shadow-accent/20 shrink-0"
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && !attachedFile)}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="md:hidden font-bold">Send Message</span>
                  <Send className="size-5" />
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isIntelOpen && (
        <aside className="w-80 hidden lg:flex flex-col bg-sidebar/50 backdrop-blur-md border-l border-border animate-in slide-in-from-right-8 duration-300">
          <header className="h-16 flex items-center px-6 border-b border-border">
            <h3 className="font-bold tracking-tight text-sm uppercase tracking-widest text-muted-foreground">Contextual Intel</h3>
          </header>
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-8">
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="size-4 text-accent" />
                  <h4 className="text-xs font-bold uppercase tracking-widest">Active Persona</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed p-4 rounded-xl bg-secondary/50 border border-border/50">
                  {agent.persona}
                </p>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <ListOrdered className="size-4 text-accent" />
                  <h4 className="text-xs font-bold uppercase tracking-widest">Skill Priority</h4>
                </div>
                <div className="space-y-2">
                  {agent.skills?.map((sId, index) => {
                    const skill = allSkills.find(s => s.id === sId);
                    return (
                      <div key={sId} className={`p-3 rounded-lg border flex items-center justify-between ${index === 0 ? 'bg-accent/10 border-accent/30' : 'bg-secondary/30 border-border/50'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold size-5 rounded-full flex items-center justify-center ${index === 0 ? 'bg-accent text-white' : 'bg-secondary text-muted-foreground'}`}>
                            {index + 1}
                          </span>
                          <span className="text-xs font-mono">{skill?.name || sId}</span>
                        </div>
                        <Zap className={`size-3 ${index === 0 ? 'text-accent' : 'text-muted-foreground/30'}`} />
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
