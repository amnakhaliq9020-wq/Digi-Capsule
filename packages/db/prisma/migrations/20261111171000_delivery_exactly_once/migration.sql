ALTER TYPE "ReleaseJobStatus" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "ReleaseJobStatus" ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE "ReleaseJobStatus" ADD VALUE IF NOT EXISTS 'uncertain';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'uncertain';

ALTER TABLE "release_jobs"
  ADD COLUMN IF NOT EXISTS "provider_response" TEXT,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "worker_id" TEXT,
  ADD COLUMN IF NOT EXISTS "retryable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "dispatch_started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ(6);

ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "provider_response" TEXT,
  ADD COLUMN IF NOT EXISTS "worker_id" TEXT,
  ADD COLUMN IF NOT EXISTS "retryable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "dispatch_started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "release_jobs_one_effect"
  ON "release_jobs" ("capsule_item_id", "person_id", "occurrence_at")
  WHERE "status" NOT IN ('cancelled'::"ReleaseJobStatus", 'dead'::"ReleaseJobStatus");
