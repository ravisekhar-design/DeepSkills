import { config } from 'dotenv';
config();

import '@/ai/flows/agent-persona-generation.ts';
import '@/ai/flows/agent-contextual-memory.ts';
import '@/ai/flows/agent-conversation-tool-execution.ts';
import '@/ai/flows/skill-generation.ts';
