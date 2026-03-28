
'use client';



export interface Skill {
  id: string;
  name: string;
  description: string;
  category: 'Finance' | 'Utility' | 'Analysis' | 'Creative' | 'Logic' | 'Intelligence';
  inputs: string[];
  enabled: boolean;
  isCustom?: boolean;
  code?: string; // Custom TypeScript implementation code
  userId?: string;
}

export interface Agent {
  id: string;
  name: string;
  persona: string;
  objectives: string[];
  parameters: Record<string, any>;
  skills: string[]; // Skill IDs
  databases?: string[]; // DatabaseConnection IDs
  status: 'active' | 'inactive';
  userId?: string;
  updatedAt?: any;
}

export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'mssql' | 'mongodb' | 'oracle' | 'sqlite';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  ssl?: boolean;
  readOnly?: boolean;
  userId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface SystemSettings {
  modelMapping: {
    personaGeneration: string;
    skillSynthesis: string;
    conversation: string;
  };
  providers: {
    google: boolean;
    openai: boolean;
    anthropic: boolean;
    aws: boolean;
    groq: boolean;
    mistral: boolean;
  };
  globalKillSwitch: boolean;
  apiKeys?: {
    google?: string;
    openai?: string;
    anthropic?: string;
    aws_access_key_id?: string;
    aws_secret_access_key?: string;
    groq?: string;
    mistral?: string;
  };
}

export const DEFAULT_SETTINGS: SystemSettings = {
  modelMapping: {
    personaGeneration: 'googleai/gemini-2.0-flash',
    skillSynthesis: 'googleai/gemini-2.0-flash',
    conversation: 'googleai/gemini-2.0-flash',
  },
  providers: {
    google: true,
    openai: false,
    anthropic: false,
    aws: false,
    groq: false,
    mistral: false,
  },
  globalKillSwitch: false,
  apiKeys: {},
};

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'stock-price',
    name: 'Market Oracle',
    description: 'Real-time equity pricing and historical volatility analysis.',
    category: 'Finance',
    inputs: ['ticker'],
    enabled: true,
  },
  {
    id: 'weather',
    name: 'Atmospheric Analyst',
    description: 'Hyper-local meteorological forecasting and environmental alerts.',
    category: 'Utility',
    inputs: ['location'],
    enabled: true,
  },
  {
    id: 'web-search',
    name: 'Neural Search',
    description: 'Deep-web crawling and semantic index lookup.',
    category: 'Analysis',
    inputs: ['query'],
    enabled: true,
  },
  {
    id: 'code-executor',
    name: 'Script Sandbox',
    description: 'Isolated environment for computational logic execution.',
    category: 'Logic',
    inputs: ['code'],
    enabled: true,
  },
  {
    id: 'clinical-auditor',
    name: 'Clinical Auditor',
    description: 'Analyzes medical text for structural anomalies and terminology alignment.',
    category: 'Analysis',
    inputs: ['report_text'],
    enabled: true,
  },
  {
    id: 'agent-browser',
    name: 'Agent Browser',
    description: 'Autonomous web navigation, interaction, and data extraction directly via browser instances.',
    category: 'Utility',
    inputs: ['url', 'instructions'],
    enabled: true,
  },
  {
    id: 'vercel-react-best-practices',
    name: 'Vercel React Best Practices',
    description: 'Expert knowledge base on optimal React architectures and Vercel Next.js deployment strategies.',
    category: 'Intelligence',
    inputs: ['code_snippet', 'query'],
    enabled: true,
  },
  {
    id: 'web-design-guidelines',
    name: 'Web Design Guidelines',
    description: 'Analyzes design patterns and provides UI/UX layout recommendations and CSS architecture.',
    category: 'Creative',
    inputs: ['component_description'],
    enabled: true,
  },
  {
    id: 'azure-ai',
    name: 'Azure AI',
    description: 'Integrates with Azure OpenAI and Cognitive Services for enterprise-grade intelligence.',
    category: 'Intelligence',
    inputs: ['prompt', 'service_type'],
    enabled: true,
  },
  {
    id: 'brainstorming',
    name: 'Deep Brainstorming',
    description: 'Unconstrained multidimensional idea generation and lateral thinking expansions.',
    category: 'Creative',
    inputs: ['topic', 'constraints'],
    enabled: true,
  },
  {
    id: 'webapp-testing',
    name: 'Web App Testing',
    description: 'Generates comprehensive E2E playwright testing suites and unit test coverage.',
    category: 'Logic',
    inputs: ['requirements', 'component_code'],
    enabled: true,
  }
];

export async function saveAgent(agent: Agent) {
  const key = `nexus_agents`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: agents } = await res.json();
  const existing = agents.findIndex((a: any) => a.id === agent.id);
  const newAgent = { ...agent, updatedAt: Date.now() };
  if (existing >= 0) {
    agents[existing] = { ...agents[existing], ...newAgent };
  } else {
    agents.push(newAgent);
  }
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: agents }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}

export async function deleteAgent(agentId: string) {
  const key = `nexus_agents`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: agents } = await res.json();
  const filtered = agents.filter((a: any) => a.id !== agentId);
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: filtered }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}

export async function saveSkill(skill: Skill) {
  const key = `nexus_skills`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: skills } = await res.json();
  const existing = skills.findIndex((a: any) => a.id === skill.id);
  const newSkill = { ...skill };
  if (existing >= 0) {
    skills[existing] = { ...skills[existing], ...newSkill };
  } else {
    skills.push(newSkill);
  }
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: skills }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}

export async function deleteSkill(skillId: string) {
  const key = `nexus_skills`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: skills } = await res.json();
  const filtered = skills.filter((a: any) => a.id !== skillId);
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: filtered }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}

export async function saveSystemSettings(settings: SystemSettings) {
  const key = `nexus_settings`;
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: settings }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}

export interface ChatThread {
  id: string;
  agentId: string;
  userId: string;
  messages: any[];
  updatedAt: number;
}

export async function saveChat(userId: string, agentId: string, messages: any[]) {
  const key = `nexus_chats`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: chats } = await res.json();

  const existingIndex = chats.findIndex((c: any) => c.agentId === agentId && c.userId === userId);

  const updatedThread: ChatThread = {
    id: existingIndex >= 0 ? chats[existingIndex].id : Math.random().toString(36).substring(7),
    agentId,
    userId,
    messages,
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) {
    chats[existingIndex] = updatedThread;
  } else {
    chats.push(updatedThread);
  }

  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: chats }),
  });
}

export async function getChat(userId: string, agentId: string): Promise<ChatThread | null> {
  const key = `nexus_chats`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: chats } = await res.json();

  const thread = chats.find((c: any) => c.agentId === agentId && c.userId === userId);
  return thread || null;
}

export async function saveDatabase(conn: DatabaseConnection) {
  const key = `nexus_databases`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: connections } = await res.json();
  const existing = connections.findIndex((c: any) => c.id === conn.id);
  const newConn = { ...conn };
  if (existing >= 0) {
    connections[existing] = { ...connections[existing], ...newConn };
  } else {
    connections.push(newConn);
  }
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: connections }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}

export async function deleteDatabase(connId: string) {
  const key = `nexus_databases`;
  const res = await fetch(`/api/store?key=${key}`);
  const { data: connections } = await res.json();
  const filtered = connections.filter((c: any) => c.id !== connId);
  await fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data: filtered }),
  });
  window.dispatchEvent(new Event('nexus-local-update'));
}
