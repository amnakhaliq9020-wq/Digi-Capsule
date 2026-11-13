CREATE TYPE "MediaShareStatus" AS ENUM ('active', 'expired', 'revoked');

CREATE TABLE "media_share_links" (
  "id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "capsule_item_id" UUID NOT NULL,
  "media_asset_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "last_access_at" TIMESTAMPTZ(6),
  "status" "MediaShareStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_share_links_token_hash_key" ON "media_share_links"("token_hash");
CREATE INDEX "media_share_links_capsule_item_id_status_idx" ON "media_share_links"("capsule_item_id", "status");
CREATE INDEX "media_share_links_media_asset_id_idx" ON "media_share_links"("media_asset_id");
CREATE INDEX "media_share_links_recipient_user_id_idx" ON "media_share_links"("recipient_user_id");
CREATE INDEX "media_share_links_expires_at_idx" ON "media_share_links"("expires_at");

ALTER TABLE "media_share_links"
  ADD CONSTRAINT "media_share_links_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "media_share_links_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "media_share_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "media_share_links_capsule_item_id_fkey" FOREIGN KEY ("capsule_item_id") REFERENCES "capsule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "media_share_links_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
