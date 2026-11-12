-- Organization display name.
--
-- Nullable on purpose: no approved backfill strategy exists for existing
-- Organizations, and inventing names for them is explicitly out of bounds.
-- Existing rows keep NULL; the application renders a neutral fallback and
-- enforces trimmed 2-120 character names for new Organizations.
ALTER TABLE "core"."organization" ADD COLUMN "name" VARCHAR(120);
