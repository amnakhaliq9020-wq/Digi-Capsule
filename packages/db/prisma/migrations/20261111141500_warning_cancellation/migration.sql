ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'delivered';

ALTER TABLE "check_in_policies" ADD COLUMN "warning_generation" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "profiles" ADD COLUMN "phone_e164" TEXT;

ALTER TABLE "notification_deliveries"
  ADD COLUMN "user_id" UUID,
  ADD COLUMN "scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "generation_id" INTEGER,
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "notification_deliveries_user_id_status_idx" ON "notification_deliveries"("user_id", "status");

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
