-- pg_trgm's default word-similarity threshold (0.6) misses a single dropped letter in short words
-- ("iphne" -> "iPhone" scores 0.5), which is the most common typo in a search box. 0.5 catches those
-- while still rejecting unrelated words. Set per database (not per query) so the <% operator, and
-- therefore the trigram GIN index, is still used. Applies to new connections.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET pg_trgm.word_similarity_threshold = 0.5', current_database());
END $$;
