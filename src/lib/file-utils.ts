/**
 * Shared file parsing utilities. Used by the semantic engine, data-prep executor,
 * and semantic service. Single source of truth for CSV/TSV/JSON parsing.
 */

import { prisma } from './prisma';

// ── CSV/TSV/JSON parser ───────────────────────────────────────────────────────

/** Splits a single CSV line respecting double-quoted fields (RFC 4180). */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function parseFileContent(
  content: string,
  fileName: string,
): Record<string, unknown>[] {
  if (!content) return [];
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    try {
      const parsed = JSON.parse(content);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
        ? parsed.data
        : [];
      return arr as Record<string, unknown>[];
    } catch { return []; }
  }

  const delim = ext === 'tsv' ? '\t' : ',';
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const rawHeaders = delim === ',' ? splitCsvLine(lines[0]) : lines[0].split(delim);
  const headers = rawHeaders.map(h => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map(line => {
    const vals = delim === ',' ? splitCsvLine(line) : line.split(delim);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const raw = (vals[i] ?? '').trim().replace(/^"|"$/g, '');
      obj[h] = raw === '' ? raw : (isNaN(Number(raw)) ? raw : Number(raw));
    });
    return obj;
  });
}

// ── Prisma-backed file fetch (handles both inline + chunked storage) ──────────

export async function fetchFileRows(
  fileId: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const file = await (prisma as any).fileRecord.findFirst({
    where: { id: fileId, userId },
  });
  if (!file) throw new Error('File not found or not accessible');

  let content: string = file.content || '';
  if (!content && file.totalChunks > 0) {
    const chunks = await (prisma as any).fileChunk.findMany({
      where: { fileId },
      orderBy: { idx: 'asc' },
      select: { content: true },
    });
    content = chunks.map((c: { content: string }) => c.content).join('');
  }
  if (!content) return [];
  return parseFileContent(content, file.name);
}

/** Reads up to `limit` sample rows from a file (avoids loading multi-MB CSVs fully). */
export async function fetchFileSample(
  fileId: string,
  userId: string,
  limit = 100,
): Promise<Record<string, unknown>[]> {
  const rows = await fetchFileRows(fileId, userId);
  return rows.slice(0, limit);
}
