ALTER TABLE "capsule_items"
  ADD COLUMN IF NOT EXISTS "schedule_generation" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "release_jobs"
  ADD COLUMN IF NOT EXISTS "schedule_generation" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "release_jobs_capsule_item_id_schedule_generation_idx"
  ON "release_jobs" ("capsule_item_id", "schedule_generation");

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY capsule_item_id ORDER BY created_at DESC) AS n
  FROM release_rules
  WHERE status = 'active'
)
UPDATE release_rules
SET status = 'cancelled', cancelled_at = NOW(), next_run_at = NULL
WHERE id IN (SELECT id FROM ranked WHERE n > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "release_rules_one_active"
  ON "release_rules" ("capsule_item_id")
  WHERE "status" = 'active';
