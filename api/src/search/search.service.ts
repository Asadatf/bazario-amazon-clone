import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogService } from '../catalog/catalog.service';
import { decodeCursor, encodeCursor, Page, pageSize, toPage } from '../common/pagination/cursor';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto, Sort } from './dto/search-query.dto';

export interface ProductListItem {
  id: string;
  title: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  ratingAvg: number;
  ratingCount: number;
  categoryId: string;
  createdAt: Date;
}

type Row = ProductListItem & { sortKey: string | number };
type Cursor = { k: string | number; id: string };

/**
 * Per sort: the expression we order by, its direction, and the SQL type to cast the cursor value back to.
 * A whitelist, so user input never becomes SQL text: only these fixed fragments do.
 */
const SORT_SPECS: Record<Sort, { key: Prisma.Sql; dir: 'ASC' | 'DESC'; cast: Prisma.Sql }> = {
  // Depends on the query text, so its key is built per request by relevanceKey().
  relevance: { key: Prisma.empty, dir: 'DESC', cast: Prisma.sql`float8` },
  price_asc: { key: Prisma.sql`p.price_cents`, dir: 'ASC', cast: Prisma.sql`int` },
  price_desc: { key: Prisma.sql`p.price_cents`, dir: 'DESC', cast: Prisma.sql`int` },
  rating: { key: Prisma.sql`p.rating_avg`, dir: 'DESC', cast: Prisma.sql`numeric` },
  newest: { key: Prisma.sql`p.created_at`, dir: 'DESC', cast: Prisma.sql`timestamptz` },
};

/**
 * Search is the read side over catalog's products table (it never writes). It's a separate module because it
 * has a different scaling story: at scale this becomes its own index (OpenSearch) fed by product-change events,
 * and only this module would change.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async search(query: SearchQueryDto): Promise<Page<ProductListItem>> {
    const size = pageSize(query.limit);
    const sort: Sort = query.sort ?? (query.q ? 'relevance' : 'rating');
    // Relevance without a query is meaningless; fall back so the cursor key is well-defined.
    const effectiveSort: Sort = sort === 'relevance' && !query.q ? 'rating' : sort;

    const conditions: Prisma.Sql[] = [];
    if (query.q) conditions.push(Prisma.sql`p.search_vector @@ websearch_to_tsquery('english', ${query.q})`);
    if (query.category) {
      const ids = await this.catalog.resolveCategoryIds(query.category);
      if (!ids.length) return { items: [], nextCursor: null };
      conditions.push(Prisma.sql`p.category_id = ANY(${ids}::uuid[])`);
    }
    if (query.minPrice !== undefined) conditions.push(Prisma.sql`p.price_cents >= ${query.minPrice}`);
    if (query.maxPrice !== undefined) conditions.push(Prisma.sql`p.price_cents <= ${query.maxPrice}`);

    const spec = SORT_SPECS[effectiveSort];
    const key = effectiveSort === 'relevance' ? relevanceKey(query.q ?? '') : spec.key;
    const op = spec.dir === 'DESC' ? Prisma.sql`<` : Prisma.sql`>`;
    if (query.cursor) {
      const c = decodeCursor<Cursor>(query.cursor, ['k', 'id']);
      // Row-value comparison: "after (key, id)" in sort order. id breaks ties so no row is skipped or repeated.
      conditions.push(Prisma.sql`(${key}, p.id) ${op} (${String(c.k)}::${spec.cast}, ${c.id}::uuid)`);
    }

    const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const dir = spec.dir === 'DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p.id, p.title, p.price_cents AS "priceCents", p.stock, p.image_url AS "imageUrl",
             p.rating_avg::float8 AS "ratingAvg", p.rating_count AS "ratingCount",
             p.category_id AS "categoryId", p.created_at AS "createdAt",
             ${key} AS "sortKey"
      FROM products p
      ${where}
      ORDER BY ${key} ${dir}, p.id ${dir}
      LIMIT ${size + 1}`;

    const page = toPage(rows, size, (last) => encodeCursor({ k: serializeKey(last.sortKey), id: last.id }));
    return { items: page.items.map(({ sortKey: _k, ...item }) => item), nextCursor: page.nextCursor };
  }
}

function relevanceKey(q: string): Prisma.Sql {
  return Prisma.sql`ts_rank(p.search_vector, websearch_to_tsquery('english', ${q}))::float8`;
}

/** Dates and numerics must round-trip exactly, or the keyset comparison would skip/repeat rows. */
function serializeKey(value: unknown): string | number {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return value;
  return String(value);
}
