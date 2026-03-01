import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Agent } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'nexus_agents.json');

async function ensureFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(AGENTS_FILE);
    } catch {
        await fs.writeFile(AGENTS_FILE, JSON.stringify([]), 'utf-8');
    }
}

async function getAgents(): Promise<Agent[]> {
    await ensureFile();
    const data = await fs.readFile(AGENTS_FILE, 'utf-8');
    return JSON.parse(data);
}

// GET all agents
export async function GET() {
    try {
        const agents = await getAgents();
        return NextResponse.json(agents);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to read agents' }, { status: 500 });
    }
}

// POST new agent
export async function POST(req: Request) {
    try {
        const newAgent = await req.json();
        const agents = await getAgents();

        // Add timestamp if not present
        if (!newAgent.createdAt) newAgent.createdAt = new Date().toISOString();
        newAgent.updatedAt = new Date().toISOString();

        agents.push(newAgent);
        await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf-8');

        return NextResponse.json(newAgent, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to check or save agent' }, { status: 500 });
    }
}
