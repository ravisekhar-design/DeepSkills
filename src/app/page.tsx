
"use client";

import { useMemo, useState, useEffect } from "react";
import { Agent, Skill, DEFAULT_SKILLS } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Zap, Activity, Clock, ChevronRight, Settings2, Loader2, LogIn, ShieldAlert, BrainCircuit } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useUser, useAuth } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

export default function Dashboard() {
  const { user, loading: authLoading } = useUser();
  const auth = useAuth();

  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    // Generate simulated neural activity data
    const data = Array.from({ length: 12 }, (_, i) => ({
      time: `${i}:00`,
      activity: Math.floor(Math.random() * 40) + 60,
      utilization: Math.floor(Math.random() * 30) + 40,
    }));
    setChartData(data);
  }, []);

  const { data: agents = [], loading: agentsLoading } = useCollection<Agent>(null, 'agents');
  const { data: customSkills = [] } = useCollection<Skill>(null, 'skills');

  const mergedSkills = useMemo(() => {
    const pureCustom = customSkills.filter((cs: Skill) => !DEFAULT_SKILLS.some(ds => ds.id === cs.id));
    return [...DEFAULT_SKILLS, ...pureCustom];
  }, [customSkills]);

  const stats = [
    { label: "Active Agents", value: agents.length, icon: Users, color: "text-accent" },
    { label: "Skill Modules", value: mergedSkills.length, icon: Zap, color: "text-blue-400" },
    { label: "Laboratory Depth", value: "98.2%", icon: BrainCircuit, color: "text-purple-400" },
    { label: "Nexus Pulse", value: "Active", icon: Activity, color: "text-green-400" },
  ];

  const handleSignIn = () => { };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <Loader2 className="size-12 animate-spin text-accent opacity-20" />
        <p className="text-muted-foreground animate-pulse font-mono text-xs uppercase tracking-widest">Establishing Neural Link...</p>
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
          <h2 className="text-3xl font-bold tracking-tighter uppercase">Nexus Operator Required</h2>
          <p className="text-muted-foreground leading-relaxed">Please establish your digital identity to access the Personal Laboratory and orchestrate your Deep Agents.</p>
        </div>
        <Button onClick={handleSignIn} size="lg" className="gradient-copper w-full h-12 text-sm font-bold uppercase tracking-widest shadow-xl shadow-accent/20">
          <LogIn className="size-4 mr-2" /> Establish Identity Link
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">System Overview</h1>
        <p className="text-muted-foreground">Monitoring the cognitive telemetry of your Personal Laboratory.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat: any) => (
          <Card key={stat.label} className="glass-panel overflow-hidden transition-all hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
                {stat.label}
              </CardTitle>
              <stat.icon className={`size-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 glass-panel">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Neural Activity Analytics</CardTitle>
            <CardDescription>Real-time processing load across active deep agents.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] w-full pt-4">
            <ChartContainer config={{
              activity: { label: "Neural Load", color: "hsl(var(--accent))" },
              utilization: { label: "Synaptic Use", color: "hsl(var(--primary))" }
            }} className="h-full w-full">
              <AreaChart data={chartData} margin={{ left: -20, right: 10 }}>
                <defs>
                  <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="activity"
                  stroke="hsl(var(--accent))"
                  fillOpacity={1}
                  fill="url(#colorActivity)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="utilization"
                  stroke="hsl(var(--primary))"
                  fill="transparent"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Entities</CardTitle>
              <CardDescription>Recently synchronized deep agents.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {agentsLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="animate-spin size-6 text-accent" />
              </div>
            ) : agents.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <p className="text-xs uppercase tracking-widest opacity-50 mb-4">No Agents Detected</p>
                <Button asChild variant="link" className="text-accent text-xs">
                  <Link href="/agents">Initialize first agent</Link>
                </Button>
              </div>
            ) : (
              agents.map((agent: Agent) => (
                <div key={agent.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/40 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-primary/40 flex items-center justify-center font-bold text-accent text-xs">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold truncate max-w-[120px]">{agent.name}</div>
                      <div className="text-[10px] text-muted-foreground">ID: {agent.id}</div>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="icon" className="size-8">
                    <Link href={`/chat?agent=${agent.id}`}>
                      <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
            <Button asChild className="w-full mt-4 gradient-copper text-xs font-bold uppercase" variant="outline">
              <Link href="/agents">Deploy New Agent</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
