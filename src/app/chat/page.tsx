"use client";

import { useMemo, Suspense } from "react";
import { Agent } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MessageSquare, Users, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ChatInterface from "@/components/chat-interface";
import { useUser } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";

function ChatPageContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const selectedAgentId = searchParams.get('agent');

  const { data: agents = [], loading } = useCollection<Agent>(null, 'agents');

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Users className="size-16 mx-auto mb-6 text-muted-foreground opacity-20" />
          <h2 className="text-2xl font-bold mb-2">Nexus Operator Required</h2>
          <p className="text-muted-foreground">Sign in to access secure communication channels.</p>
        </div>
      </div>
    );
  }

  if (selectedAgentId) {
    const agent = agents.find(a => a.id === selectedAgentId);
    if (agent) {
      return <ChatInterface agent={agent} />;
    }
  }

  return (
    <div className="h-screen flex items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-8 text-center">
        <div className="space-y-2">
          <div className="size-16 rounded-2xl gradient-copper mx-auto flex items-center justify-center shadow-xl shadow-accent/20 mb-6">
            <MessageSquare className="size-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Nexus Communication Channel</h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Select a Deep Agent to establish a contextual secure link and begin high-level task execution.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
          {loading ? (
            <div className="col-span-full py-12 flex justify-center">
              <Loader2 className="animate-spin size-8 text-accent" />
            </div>
          ) : agents.length > 0 ? (
            agents.map((agent) => (
              <Card key={agent.id} className="glass-panel text-left hover:border-accent/40 transition-all cursor-pointer group">
                <Link href={`/chat?agent=${agent.id}`} className="block h-full">
                  <CardHeader>
                    <div className="size-10 rounded-lg bg-primary/30 flex items-center justify-center font-bold text-accent mb-4">
                      {agent.name.charAt(0)}
                    </div>
                    <CardTitle className="group-hover:text-accent transition-colors">{agent.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{agent.persona}</CardDescription>
                  </CardHeader>
                  <div className="px-6 pb-6 mt-auto">
                    <div className="flex items-center text-xs font-bold text-accent uppercase tracking-widest">
                      Establish Link <ChevronRight className="size-3 ml-1" />
                    </div>
                  </div>
                </Link>
              </Card>
            ))
          ) : (
            <div className="col-span-full py-12 border border-dashed rounded-xl bg-secondary/10">
              <Users className="size-12 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground mb-4">No agents available in the Nexus.</p>
              <Button asChild className="gradient-copper">
                <Link href="/agents">Configure Agent</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin size-8 text-accent" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
