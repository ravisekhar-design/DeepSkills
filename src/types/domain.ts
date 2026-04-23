/**
 * LAYER: Shared Contract
 * Canonical domain types. These are the single source of truth for all
 * business entities. Both server services and client services reference these.
 */

// ── Skill ─────────────────────────────────────────────────────────────────────

export type SkillCategory =
  | 'Finance'
  | 'Utility'
  | 'Analysis'
  | 'Creative'
  | 'Logic'
  | 'Intelligence';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  inputs: string[];
  enabled: boolean;
  isCustom?: boolean;
  code?: string;
  manifest?: string;
  userId?: string;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'inactive';

export interface Agent {
  id: string;
  name: string;
  persona: string;
  objectives: string[];
  parameters: Record<string, unknown>;
  skills: string[];
  databases?: string[];
  fileFolders?: string[];
  files?: string[];
  status: AgentStatus;
  userId?: string;
  updatedAt?: number;
  code?: string;
}

// ── Database connection ───────────────────────────────────────────────────────

export type DbType =
  | 'postgresql'
  | 'mysql'
  | 'mssql'
  | 'mongodb'
  | 'oracle'
  | 'sqlite';

export interface DatabaseConnection {
  id: string;
  name: string;
  type: DbType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  /** Masked on GET responses (shown as ••••••••) */
  password?: string;
  connectionString?: string;
  ssl?: boolean;
  readOnly?: boolean;
  userId?: string;
  createdAt?: number;
}

// ── System settings ───────────────────────────────────────────────────────────

export interface ModelMapping {
  personaGeneration: string;
  skillSynthesis: string;
  conversation: string;
  visualize: string;
}

export interface ProviderSettings {
  google: boolean;
  openai: boolean;
  anthropic: boolean;
  aws: boolean;
  groq: boolean;
  mistral: boolean;
}

export interface ApiKeys {
  google?: string;
  openai?: string;
  anthropic?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  groq?: string;
  mistral?: string;
}

export interface SystemSettings {
  modelMapping: ModelMapping;
  providers: ProviderSettings;
  globalKillSwitch: boolean;
  apiKeys?: ApiKeys;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  timestamp?: number;
}

export interface ChatThread {
  id: string;
  agentId: string;
  userId: string;
  messages: ChatMessage[];
  updatedAt: number;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface Dashboard {
  id: string;
  name: string;
  widgetCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  title: string;
  chartType?: string;
  chartConfig?: Record<string, unknown>;
  dataSourceType?: 'database' | 'file';
  dataSourceId?: string;
  dataSourceName?: string;
  dataQuery?: string;
  prompt?: string;
  gridW?: number;
  createdAt?: number;
}

// ── Files ─────────────────────────────────────────────────────────────────────

export interface FileFolder {
  id: string;
  name: string;
  userId?: string;
  fileCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface FileRecord {
  id: string;
  folderId: string;
  name: string;
  mimeType: string;
  size: number;
  content?: string;
  userId?: string;
  createdAt?: number;
}
