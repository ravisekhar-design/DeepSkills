/**
 * LAYER: Backend / Core Service
 * External database connection management.
 * Passwords are masked on read; only written when a real (non-masked) value
 * is supplied.
 */

import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { DatabaseConnection } from '@/types/domain';

const MASK = '••••••••';

function maskRow(c: any): DatabaseConnection {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    host: c.host ?? undefined,
    port: c.port ?? undefined,
    database: c.database ?? undefined,
    username: c.username ?? undefined,
    password: c.password ? MASK : undefined,
    connectionString: c.connectionString ? MASK : undefined,
    ssl: c.ssl,
    readOnly: c.readOnly,
    userId: c.userId,
    createdAt: c.createdAt?.getTime?.() ?? c.createdAt,
  };
}

function isReal(val: string | undefined): boolean {
  return Boolean(val && !val.includes('•'));
}

export const databaseService = {
  async getAll(userId: string): Promise<DatabaseConnection[]> {
    const rows = await (prisma as any).databaseConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(maskRow);
  },

  async getByIdRaw(userId: string, id: string) {
    const row = await (prisma as any).databaseConnection.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundError('DatabaseConnection', id);
    return row;
  },

  async create(userId: string, data: Omit<DatabaseConnection, 'id' | 'userId' | 'createdAt'>): Promise<DatabaseConnection> {
    if (!data.name?.trim()) throw new ValidationError('name is required');
    if (!data.type) throw new ValidationError('type is required');
    const row = await (prisma as any).databaseConnection.create({
      data: {
        userId,
        name: data.name.trim(),
        type: data.type,
        host: data.host || null,
        port: data.port ? Number(data.port) : null,
        database: data.database || null,
        username: data.username || null,
        password: data.password || null,
        connectionString: data.connectionString || null,
        ssl: data.ssl ?? false,
        readOnly: data.readOnly !== false,
      },
    });
    return maskRow(row);
  },

  async update(userId: string, id: string, data: Partial<DatabaseConnection>): Promise<void> {
    await this.getByIdRaw(userId, id); // ownership check
    const updateData: Record<string, unknown> = {
      name: data.name,
      type: data.type,
      host: data.host || null,
      port: data.port ? Number(data.port) : null,
      database: data.database || null,
      username: data.username || null,
      ssl: data.ssl ?? false,
      readOnly: data.readOnly !== false,
    };
    if (isReal(data.password)) updateData.password = data.password;
    if (isReal(data.connectionString)) updateData.connectionString = data.connectionString;
    await (prisma as any).databaseConnection.update({ where: { id }, data: updateData });
  },

  async delete(userId: string, id: string): Promise<void> {
    await (prisma as any).databaseConnection.deleteMany({ where: { id, userId } });
  },

  /** Bulk upsert — used by the legacy /api/store route. */
  async upsertMany(userId: string, conns: DatabaseConnection[]): Promise<void> {
    for (const c of conns) {
      await (prisma as any).databaseConnection.upsert({
        where: { id: c.id ?? '' },
        update: {
          name: c.name, type: c.type,
          host: c.host || null, port: c.port ? Number(c.port) : null,
          database: c.database || null, username: c.username || null,
          ...(isReal(c.password) ? { password: c.password } : {}),
          ...(isReal(c.connectionString) ? { connectionString: c.connectionString } : {}),
          ssl: c.ssl ?? false, readOnly: c.readOnly !== false,
        },
        create: {
          ...(c.id ? { id: c.id } : {}), userId,
          name: c.name, type: c.type,
          host: c.host || null, port: c.port ? Number(c.port) : null,
          database: c.database || null, username: c.username || null,
          password: c.password || null, connectionString: c.connectionString || null,
          ssl: c.ssl ?? false, readOnly: c.readOnly !== false,
        },
      });
    }
    const ids = conns.map(c => c.id).filter(Boolean) as string[];
    if (ids.length > 0) {
      await (prisma as any).databaseConnection.deleteMany({ where: { userId, id: { notIn: ids } } });
    } else if (conns.length === 0) {
      await (prisma as any).databaseConnection.deleteMany({ where: { userId } });
    }
  },
};
