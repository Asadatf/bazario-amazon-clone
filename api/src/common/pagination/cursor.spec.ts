import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor, MAX_PAGE_SIZE, pageSize, toPage } from './cursor';

describe('cursor pagination helpers', () => {
  it('round-trips a cursor', () => {
    const c = encodeCursor({ k: 1999, id: 'abc' });
    expect(decodeCursor(c, ['k', 'id'])).toEqual({ k: 1999, id: 'abc' });
  });

  it('rejects malformed or incomplete cursors with 400', () => {
    expect(() => decodeCursor('%%%', ['k'])).toThrow(BadRequestException);
    expect(() => decodeCursor(encodeCursor({ k: 1 }), ['k', 'id'])).toThrow(BadRequestException);
  });

  it('caps the page size', () => {
    expect(pageSize(undefined)).toBe(20);
    expect(pageSize(10_000)).toBe(MAX_PAGE_SIZE);
  });

  it('uses the extra row only to decide whether there is a next page', () => {
    expect(toPage([1, 2, 3], 2, String)).toEqual({ items: [1, 2], nextCursor: '2' });
    expect(toPage([1, 2], 2, String)).toEqual({ items: [1, 2], nextCursor: null });
  });
});
