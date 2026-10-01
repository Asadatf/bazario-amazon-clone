-- Full-text search matches whole (stemmed) words, so "phone" never finds "smartphone"/"iPhone" and a typo
-- like "headphnes" finds nothing. Trigrams cover both: substring match (ILIKE) and fuzzy word similarity.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index lets ILIKE '%x%' and the <% (word similarity) operator use an index instead of a scan.
CREATE INDEX "products_title_trgm_idx" ON "products" USING GIN ("title" gin_trgm_ops);
