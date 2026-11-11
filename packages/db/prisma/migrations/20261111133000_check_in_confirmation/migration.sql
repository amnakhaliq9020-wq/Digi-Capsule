-- Account activity fields. Existing policies keep their current due time.
CREATE TYPE "AccountCheckStatus" AS ENUM ('on_time', 'awaiting_confirmation', 'paused', 'escalation_pending');
CREATE TYPE "EscalationStatus" AS ENUM ('none', 'pending', 'cancelled');

ALTER TABLE "check_in_policies"
  ADD COLUMN "next_check_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmation_requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "confirmation_deadline" TIMESTAMPTZ(6),
  ADD COLUMN "account_check_status" "AccountCheckStatus" NOT NULL DEFAULT 'on_time',
  ADD COLUMN "last_notification_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "escalation_status" "EscalationStatus" NOT NULL DEFAULT 'none';

UPDATE "check_in_policies" SET "next_check_at" = "next_due_at" WHERE "next_check_at" IS NULL;
ALTER TABLE "check_in_policies" ALTER COLUMN "next_check_at" SET NOT NULL;

CREATE INDEX "check_in_policies_next_check_at_idx" ON "check_in_policies"("next_check_at");

CREATE TABLE "check_in_confirmation_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_confirmation_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "check_in_confirmation_tokens_token_hash_key" ON "check_in_confirmation_tokens"("token_hash");
CREATE INDEX "check_in_confirmation_tokens_user_id_idx" ON "check_in_confirmation_tokens"("user_id");

ALTER TABLE "check_in_confirmation_tokens"
  ADD CONSTRAINT "check_in_confirmation_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep one notice per cycle, type, and day offset. Confirmed events have no offset and stay unrestricted.
DELETE FROM "check_in_events" AS later
USING "check_in_events" AS earlier
WHERE later.cycle_id = earlier.cycle_id
  AND later.type = earlier.type
  AND later.offset_days = earlier.offset_days
  AND later.offset_days IS NOT NULL
  AND later.ctid > earlier.ctid;

CREATE UNIQUE INDEX "check_in_events_cycle_id_type_offset_days_key"
  ON "check_in_events"("cycle_id", "type", "offset_days");
