import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Skill } from '@/lib/store';

const DATA_DIR = path.join(process.cwd(), 'data');
const SKILLS_FILE = path.join(DATA_DIR, 'nexus_skills.json');

async function getSkills(): Promise<Skill[]> {
    try {
        const data = await fs.readFile(SKILLS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// GET single skill
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const items = await getSkills();
        const item = items.find(a => a.id === id);
        if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json(item);
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const updateData = await req.json();
        const items = await getSkills();
        const index = items.findIndex(a => a.id === id);
        if (index === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        items[index] = { ...items[index], ...updateData };
        await fs.writeFile(SKILLS_FILE, JSON.stringify(items, null, 2), 'utf-8');
        return NextResponse.json(items[index]);
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const items = await getSkills();
        const filtered = items.filter(a => a.id !== id);
        await fs.writeFile(SKILLS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
