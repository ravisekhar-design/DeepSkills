import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Agent } from '@/lib/store';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENTS_FILE = path.join(DATA_DIR, 'nexus_agents.json');

async function getAgents(): Promise<Agent[]> {
    try {
        const data = await fs.readFile(AGENTS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// GET single agent
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const agents = await getAgents();
        const agent = agents.find(a => a.id === id);
        if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(agent);
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// PUT / UPDATE an agent
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const updateData = await req.json();
        const agents = await getAgents();

        const index = agents.findIndex(a => a.id === id);
        if (index === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        updateData.updatedAt = new Date().toISOString();
        agents[index] = { ...agents[index], ...updateData };

        await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf-8');
        return NextResponse.json(agents[index]);
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// DELETE an agent
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const agents = await getAgents();
        const filteredAgents = agents.filter(a => a.id !== id);
        await fs.writeFile(AGENTS_FILE, JSON.stringify(filteredAgents, null, 2), 'utf-8');
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
