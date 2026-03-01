import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Skill } from '@/lib/store';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const SKILLS_FILE = path.join(DATA_DIR, 'nexus_skills.json');

async function ensureFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(SKILLS_FILE);
    } catch {
        await fs.writeFile(SKILLS_FILE, JSON.stringify([]), 'utf-8');
    }
}

async function getSkills(): Promise<Skill[]> {
    await ensureFile();
    const data = await fs.readFile(SKILLS_FILE, 'utf-8');
    return JSON.parse(data);
}

// GET all custom skills
export async function GET() {
    try {
        const items = await getSkills();
        return NextResponse.json(items);
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

// POST new system skill
export async function POST(req: Request) {
    try {
        const newItem = await req.json();
        const items = await getSkills();
        items.push(newItem);
        await fs.writeFile(SKILLS_FILE, JSON.stringify(items, null, 2), 'utf-8');
        return NextResponse.json(newItem, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
