import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB text limit per file

// ── GET ──────────────────────────────────────────────────────────────────────
// ?type=folders                      → list all user folders (with file counts)
// ?type=files&folderId=xxx           → list files in a folder (no content)
// ?type=content&fileId=xxx           → fetch full content of a single file
// ?type=folder-context&folderIds=a,b → fetch all file contents for agent context
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'folders') {
      const folders = await (prisma as any).fileFolder.findMany({
        where: { userId },
        include: { _count: { select: { files: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({
        data: folders.map((f: any) => ({
          id: f.id,
          name: f.name,
          fileCount: f._count.files,
          createdAt: f.createdAt.getTime(),
          updatedAt: f.updatedAt.getTime(),
        })),
      });
    }

    if (type === 'files') {
      const folderId = searchParams.get('folderId');
      if (!folderId) return NextResponse.json({ error: 'folderId required' }, { status: 400 });

      // Verify folder belongs to user
      const folder = await (prisma as any).fileFolder.findFirst({ where: { id: folderId, userId } });
      if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const files = await (prisma as any).fileRecord.findMany({
        where: { folderId, userId },
        select: { id: true, name: true, mimeType: true, size: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({
        data: files.map((f: any) => ({ ...f, createdAt: f.createdAt.getTime() })),
      });
    }

    if (type === 'content') {
      const fileId = searchParams.get('fileId');
      if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });
      const file = await (prisma as any).fileRecord.findFirst({ where: { id: fileId, userId } });
      if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ data: { id: file.id, name: file.name, content: file.content, mimeType: file.mimeType } });
    }

    // ?type=files-context&fileIds=a,b,c  → fetch specific files by ID
    if (type === 'files-context') {
      const fileIds = (searchParams.get('fileIds') || '').split(',').filter(Boolean);
      if (!fileIds.length) return NextResponse.json({ data: '' });

      const files = await (prisma as any).fileRecord.findMany({
        where: { id: { in: fileIds }, userId },
        select: { id: true, name: true, content: true, mimeType: true, totalChunks: true },
      });

      const contextBlocks: string[] = [];
      for (const file of files) {
        let content = file.content;
        if (!content && file.totalChunks > 0) {
          const firstChunk = await (prisma as any).fileChunk.findFirst({
            where: { fileId: file.id },
            orderBy: { idx: 'asc' },
          });
          content = firstChunk?.content || '';
        }
        contextBlocks.push(`--- File: ${file.name} ---\n${content || ''}\n---`);
      }
      return NextResponse.json({ data: contextBlocks.join('\n\n') });
    }

    if (type === 'folder-context') {
      const folderIds = (searchParams.get('folderIds') || '').split(',').filter(Boolean);
      if (!folderIds.length) return NextResponse.json({ data: '' });

      const folders = await (prisma as any).fileFolder.findMany({
        where: { id: { in: folderIds }, userId },
        include: { files: { select: { id: true, name: true, content: true, mimeType: true, totalChunks: true } } },
      });

      const contextBlocks: string[] = [];
      for (const folder of folders) {
        for (const file of folder.files) {
          let content = file.content;
          // For chunked files, read the first chunk — sufficient for context budget
          if (!content && file.totalChunks > 0) {
            const firstChunk = await (prisma as any).fileChunk.findFirst({
              where: { fileId: file.id },
              orderBy: { idx: 'asc' },
            });
            content = firstChunk?.content || '';
          }
          contextBlocks.push(
            `--- File: ${file.name} (Folder: ${folder.name}) ---\n${content || ''}\n---`
          );
        }
      }
      return NextResponse.json({ data: contextBlocks.join('\n\n') });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('[Files GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────
// { type: 'folder', name }
// { type: 'file', folderId, name, content, mimeType }       → single upload
// { type: 'file-start', folderId, name, mimeType, totalSize, totalChunks } → start chunked
// { type: 'file-chunk', fileId, idx, content }              → upload one chunk
// { type: 'file-finalize', fileId }                         → assemble + store
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const body = await request.json();

    // ── Create folder ───────────────────────────────────────────────────────
    if (body.type === 'folder') {
      const { name } = body;
      if (!name?.trim()) return NextResponse.json({ error: 'Folder name required' }, { status: 400 });
      const folder = await (prisma as any).fileFolder.create({
        data: { userId, name: name.trim() },
      });
      return NextResponse.json({ data: { id: folder.id, name: folder.name, fileCount: 0, createdAt: folder.createdAt.getTime() } });
    }

    // ── Single file upload (small files ≤ 4 MB) ────────────────────────────
    if (body.type === 'file') {
      const { folderId, name, content, mimeType } = body;
      if (!folderId || !name || content === undefined) {
        return NextResponse.json({ error: 'folderId, name, and content are required' }, { status: 400 });
      }
      const folder = await (prisma as any).fileFolder.findFirst({ where: { id: folderId, userId } });
      if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

      const byteSize = Buffer.byteLength(content, 'utf8');
      if (byteSize > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB). Use chunked upload for larger files.` }, { status: 413 });
      }

      const file = await (prisma as any).fileRecord.create({
        data: { userId, folderId, name: name.trim(), mimeType: mimeType || 'text/plain', size: byteSize, content },
      });
      return NextResponse.json({ data: { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, createdAt: file.createdAt.getTime() } });
    }

    // ── Start chunked upload ───────────────────────────────────────────────
    if (body.type === 'file-start') {
      const { folderId, name, mimeType, totalSize, totalChunks } = body;
      if (!folderId || !name || !totalChunks) {
        return NextResponse.json({ error: 'folderId, name, totalChunks required' }, { status: 400 });
      }
      const folder = await (prisma as any).fileFolder.findFirst({ where: { id: folderId, userId } });
      if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

      const file = await (prisma as any).fileRecord.create({
        data: {
          userId,
          folderId,
          name: name.trim(),
          mimeType: mimeType || 'text/plain',
          size: totalSize || 0,
          content: null,
          totalChunks,
        },
      });
      return NextResponse.json({ data: { id: file.id } });
    }

    // ── Upload one chunk ───────────────────────────────────────────────────
    if (body.type === 'file-chunk') {
      const { fileId, idx, content } = body;
      if (!fileId || idx === undefined || content === undefined) {
        return NextResponse.json({ error: 'fileId, idx, content required' }, { status: 400 });
      }
      const file = await (prisma as any).fileRecord.findFirst({ where: { id: fileId, userId } });
      if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

      await (prisma as any).fileChunk.upsert({
        where: { fileId_idx: { fileId, idx } },
        create: { fileId, idx, content },
        update: { content },
      });
      return NextResponse.json({ success: true });
    }

    // ── Finalize: reassemble chunks → store in content field ───────────────
    if (body.type === 'file-finalize') {
      const { fileId } = body;
      if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

      const file = await (prisma as any).fileRecord.findFirst({ where: { id: fileId, userId } });
      if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

      const chunks = await (prisma as any).fileChunk.findMany({
        where: { fileId },
        orderBy: { idx: 'asc' },
      });

      const assembled = chunks.map((c: any) => c.content).join('');
      const byteSize = Buffer.byteLength(assembled, 'utf8');

      await (prisma as any).fileRecord.update({
        where: { id: fileId },
        data: { content: assembled, size: byteSize, totalChunks: 0 },
      });
      // Clean up chunks after assembly
      await (prisma as any).fileChunk.deleteMany({ where: { fileId } });

      return NextResponse.json({ data: { id: file.id, name: file.name, mimeType: file.mimeType, size: byteSize, createdAt: file.createdAt.getTime() } });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('[Files POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
// ?type=folder&id=xxx  → delete folder + all its files
// ?type=file&id=xxx    → delete single file
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any).id;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (type === 'folder') {
      const folder = await (prisma as any).fileFolder.findFirst({ where: { id, userId } });
      if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      // Cascade deletes files too via schema relation
      await (prisma as any).fileFolder.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    if (type === 'file') {
      const file = await (prisma as any).fileRecord.findFirst({ where: { id, userId } });
      if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      await (prisma as any).fileRecord.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('[Files DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
