'use server';
/**
 * @fileOverview This flow enables an AI agent to remember and apply information from past conversations.
 *
 * - agentContextualMemory - A function that handles generating responses based on conversation history.
 * - AgentContextualMemoryInput - The input type for the agentContextualMemory function.
 * - AgentContextualMemoryOutput - The return type for the agentContextualMemory function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AgentContextualMemoryInputSchema = z.object({
  currentQuery: z.string().describe('The current query from the user.'),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'agent']).describe('The role of the speaker (user or agent).'),
      content: z.string().describe('The content of the conversation turn.'),
    })
  ).describe('A list of past conversation turns, alternating between user and agent roles, ordered chronologically.'),
});
export type AgentContextualMemoryInput = z.infer<typeof AgentContextualMemoryInputSchema>;

const AgentContextualMemoryOutputSchema = z.object({
  response: z.string().describe('The agent\'s contextually relevant response based on the conversation history.'),
});
export type AgentContextualMemoryOutput = z.infer<typeof AgentContextualMemoryOutputSchema>;

export async function agentContextualMemory(
  input: AgentContextualMemoryInput
): Promise<AgentContextualMemoryOutput> {
  return agentContextualMemoryFlow(input);
}

const agentContextualMemoryPrompt = ai.definePrompt({
  name: 'agentContextualMemoryPrompt',
  input: { schema: AgentContextualMemoryInputSchema },
  output: { schema: AgentContextualMemoryOutputSchema },
  prompt: `You are an AI agent designed to provide consistent, personalized, and contextually relevant responses.
Your goal is to understand the user's intent based on the entire conversation history and provide a helpful and coherent answer.

Conversation History:
{{#each conversationHistory}}
  {{this.role}}: {{this.content}}
{{/each}}

User's current query: "{{{currentQuery}}}"

Based on the conversation history and the current query, provide a concise and helpful response, maintaining context from previous turns.`,
});

const agentContextualMemoryFlow = ai.defineFlow(
  {
    name: 'agentContextualMemoryFlow',
    inputSchema: AgentContextualMemoryInputSchema,
    outputSchema: AgentContextualMemoryOutputSchema,
  },
  async (input) => {
    const { output } = await agentContextualMemoryPrompt(input);
    return output!;
  }
);
