import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

        let data: any = [];

        if (key === 'nexus_agents') {
            const agents = await prisma.agent.findMany({ where: { userId } });
            data = agents.map(a => ({
                id: a.id,
                name: a.name,
                persona: a.persona,
                objectives: (() => { try { return JSON.parse(a.objectives); } catch { return []; } })(),
                parameters: (() => { try { return JSON.parse(a.parameters); } catch { return {}; } })(),
                skills: (() => { try { return JSON.parse(a.skills); } catch { return []; } })(),
                databases: (() => { try { return JSON.parse((a as any).databases || '[]'); } catch { return []; } })(),
                fileFolders: (() => { try { return JSON.parse((a as any).fileFolders || '[]'); } catch { return []; } })(),
                files: (() => { try { return JSON.parse((a as any).files || '[]'); } catch { return []; } })(),
                status: a.status,
                updatedAt: a.updatedAt.getTime(),
            }));
        } else if (key === 'nexus_skills') {
            const skills = await prisma.skill.findMany({ where: { userId } });
            data = skills.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                category: s.category,
                inputs: (() => { try { return JSON.parse(s.inputs); } catch { return []; } })(),
                enabled: s.enabled,
                isCustom: s.isCustom
            }));
        } else if (key === 'nexus_settings') {
            const settings = await prisma.systemSettings.findUnique({ where: { userId } });
            if (settings) {
                data = {
                    modelMapping: JSON.parse(settings.modelMapping),
                    providers: JSON.parse(settings.providers),
                    globalKillSwitch: settings.globalKillSwitch,
                    apiKeys: settings.apiKeys ? JSON.parse(settings.apiKeys) : {}
                };
            } else {
                data = null;
            }
        } else if (key === 'nexus_databases') {
            const conns = await (prisma as any).databaseConnection.findMany({ where: { userId } });
            data = conns.map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                host: c.host,
                port: c.port,
                database: c.database,
                username: c.username,
                password: c.password ? '••••••••' : '',
                connectionString: c.connectionString ? '••••••••' : '',
                ssl: c.ssl,
                readOnly: c.readOnly,
                createdAt: c.createdAt.getTime(),
            }));
        } else if (key === 'nexus_chats') {
            const chats = await prisma.chatThread.findMany({ where: { userId } });
            data = chats.map((c: any) => ({
                id: c.id,
                agentId: c.agentId,
                userId: c.userId,
                messages: (() => { try { return JSON.parse(c.messages); } catch { return []; } })(),
                updatedAt: c.updatedAt.getTime(),
            }));
        }

        return NextResponse.json({ data: data ?? [] });
    } catch (error: any) {
        console.error("Store GET error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const { key, data } = await request.json();

        if (!key || data === undefined) return NextResponse.json({ error: 'Missing key or data' }, { status: 400 });

        if (key === 'nexus_agents') {
            if (Array.isArray(data)) {
                await prisma.$transaction(
                    data.map((a: any) => prisma.agent.upsert({
                        where: { id: a.id || '' },
                        update: {
                            name: a.name,
                            persona: a.persona,
                            objectives: Array.isArray(a.objectives) ? JSON.stringify(a.objectives) : (a.objectives || '[]'),
                            parameters: typeof a.parameters === 'object' ? JSON.stringify(a.parameters) : (a.parameters || '{}'),
                            skills: Array.isArray(a.skills) ? JSON.stringify(a.skills) : (a.skills || '[]'),
                            databases: Array.isArray(a.databases) ? JSON.stringify(a.databases) : (a.databases || '[]'),
                            fileFolders: Array.isArray(a.fileFolders) ? JSON.stringify(a.fileFolders) : (a.fileFolders || '[]'),
                            files: Array.isArray(a.files) ? JSON.stringify(a.files) : (a.files || '[]'),
                            status: a.status || 'active',
                        },
                        create: {
                            id: a.id,
                            userId,
                            name: a.name,
                            persona: a.persona,
                            objectives: Array.isArray(a.objectives) ? JSON.stringify(a.objectives) : (a.objectives || '[]'),
                            parameters: typeof a.parameters === 'object' ? JSON.stringify(a.parameters) : (a.parameters || '{}'),
                            skills: Array.isArray(a.skills) ? JSON.stringify(a.skills) : (a.skills || '[]'),
                            databases: Array.isArray(a.databases) ? JSON.stringify(a.databases) : (a.databases || '[]'),
                            fileFolders: Array.isArray(a.fileFolders) ? JSON.stringify(a.fileFolders) : (a.fileFolders || '[]'),
                            files: Array.isArray(a.files) ? JSON.stringify(a.files) : (a.files || '[]'),
                            status: a.status || 'active',
                        }
                    }))
                );
                // Remove any agents not in the new list (deletions)
                const incomingIds = data.map((a: any) => a.id).filter(Boolean);
                if (incomingIds.length > 0) {
                    await prisma.agent.deleteMany({ where: { userId, id: { notIn: incomingIds } } });
                }
            }
        } else if (key === 'nexus_skills') {
            if (Array.isArray(data)) {
                await prisma.$transaction(
                    data.map((s: any) => prisma.skill.upsert({
                        where: { id: s.id || '' },
                        update: {
                            name: s.name,
                            description: s.description,
                            category: s.category,
                            inputs: JSON.stringify(s.inputs || []),
                            enabled: s.enabled !== false,
                            isCustom: s.isCustom || false,
                        },
                        create: {
                            id: s.id,
                            userId,
                            name: s.name,
                            description: s.description,
                            category: s.category,
                            inputs: JSON.stringify(s.inputs || []),
                            enabled: s.enabled !== false,
                            isCustom: s.isCustom || false,
                        }
                    }))
                );
                const incomingIds = data.map((s: any) => s.id).filter(Boolean);
                if (incomingIds.length > 0) {
                    await prisma.skill.deleteMany({ where: { userId, id: { notIn: incomingIds } } });
                }
            }
        } else if (key === 'nexus_databases') {
            if (Array.isArray(data)) {
                for (const c of data) {
                    await (prisma as any).databaseConnection.upsert({
                        where: { id: c.id || '' },
                        update: {
                            name: c.name, type: c.type,
                            host: c.host || null, port: c.port || null,
                            database: c.database || null, username: c.username || null,
                            ...(c.password && !c.password.includes('•') ? { password: c.password } : {}),
                            ...(c.connectionString && !c.connectionString.includes('•') ? { connectionString: c.connectionString } : {}),
                            ssl: c.ssl || false, readOnly: c.readOnly !== false,
                        },
                        create: {
                            ...(c.id ? { id: c.id } : {}), userId,
                            name: c.name, type: c.type,
                            host: c.host || null, port: c.port || null,
                            database: c.database || null, username: c.username || null,
                            password: c.password || null, connectionString: c.connectionString || null,
                            ssl: c.ssl || false, readOnly: c.readOnly !== false,
                        },
                    });
                }
                const incomingIds = data.map((c: any) => c.id).filter(Boolean);
                if (incomingIds.length > 0) {
                    await (prisma as any).databaseConnection.deleteMany({ where: { userId, id: { notIn: incomingIds } } });
                } else if (data.length === 0) {
                    await (prisma as any).databaseConnection.deleteMany({ where: { userId } });
                }
            }
        } else if (key === 'nexus_settings') {
            await prisma.systemSettings.upsert({
                where: { userId },
                update: {
                    modelMapping: JSON.stringify(data.modelMapping || {}),
                    providers: JSON.stringify(data.providers || {}),
                    globalKillSwitch: data.globalKillSwitch || false,
                    apiKeys: data.apiKeys ? JSON.stringify(data.apiKeys) : null
                },
                create: {
                    userId,
                    modelMapping: JSON.stringify(data.modelMapping || {}),
                    providers: JSON.stringify(data.providers || {}),
                    globalKillSwitch: data.globalKillSwitch || false,
                    apiKeys: data.apiKeys ? JSON.stringify(data.apiKeys) : null
                }
            });
        } else if (key === 'nexus_chats') {
            if (Array.isArray(data)) {
                await prisma.$transaction(
                    data.map((c: any) => prisma.chatThread.upsert({
                        where: { userId_agentId: { userId, agentId: c.agentId } },
                        update: {
                            messages: JSON.stringify(c.messages || []),
                        },
                        create: {
                            id: c.id,
                            userId,
                            agentId: c.agentId,
                            messages: JSON.stringify(c.messages || []),
                        }
                    }))
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Store POST error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
