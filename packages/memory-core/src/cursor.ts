export interface CursorData {
  updatedAt: string; // ISO 8601
  id: string;
}

export function encodeCursor(updatedAt: Date, id: string): string {
  const data: CursorData = {
    updatedAt: updatedAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json) as CursorData;
    if (typeof data.updatedAt !== 'string' || typeof data.id !== 'string') {
      throw new Error('Invalid cursor structure');
    }
    return data;
  } catch {
    throw new CursorError('Invalid cursor');
  }
}

export class CursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorError';
  }
}
