ALTER TABLE "notification_deliveries"
  ADD COLUMN IF NOT EXISTS "payload" JSONB;
