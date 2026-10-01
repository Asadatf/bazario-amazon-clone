import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export class CursorQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page`s nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE_SIZE, description: `Values above ${MAX_PAGE_SIZE} are capped to ${MAX_PAGE_SIZE}` })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Cursors are opaque base64url JSON so clients can't depend on their shape and we can change it freely.
 * They hold the last row's sort key + id: keyset pagination stays fast and stable while rows are inserted,
 * unlike OFFSET which rescans skipped rows and shifts when data changes.
 */
export function encodeCursor(payload: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor<T extends Record<string, string | number>>(cursor: string, keys: (keyof T)[]): T {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null && keys.every((k) => k in parsed)) return parsed as T;
  } catch {
    // fall through to the 400 below
  }
  throw new BadRequestException('Invalid cursor');
}

/** Capped rather than rejected: a client asking for 1000 gets a valid (smaller) page, never an unbounded query. */
export function pageSize(limit?: number): number {
  return Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

/** Fetch `size + 1` rows; the extra one only tells us whether another page exists. */
export function toPage<T>(rows: T[], size: number, cursorOf: (last: T) => string): Page<T> {
  const items = rows.slice(0, size);
  const hasMore = rows.length > size;
  return { items, nextCursor: hasMore && items.length ? cursorOf(items[items.length - 1]) : null };
}
