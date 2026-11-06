-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'pending_deletion', 'deleted');

-- CreateEnum
CREATE TYPE "CapsuleStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('letter', 'photo', 'video', 'audio', 'document', 'collection');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('draft', 'scheduled', 'released', 'withheld', 'cancelled');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'ready', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "ContactRoleKind" AS ENUM ('recipient', 'trusted_contact', 'verifier');

-- CreateEnum
CREATE TYPE "GrantVisibility" AS ENUM ('hidden', 'released_only');

-- CreateEnum
CREATE TYPE "ReleaseTrigger" AS ENUM ('exact_time', 'annual', 'recipient_age', 'embargo_until_age', 'embargo_until_time', 'after_verification');

-- CreateEnum
CREATE TYPE "ReleaseRuleStatus" AS ENUM ('active', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReleaseJobStatus" AS ENUM ('pending', 'sending', 'sent', 'failed', 'cancelled', 'dead');

-- CreateEnum
CREATE TYPE "CheckInCycleState" AS ENUM ('due', 'reminded', 'confirmed', 'missed_unreachable', 'cancelled');

-- CreateEnum
CREATE TYPE "CheckInEventType" AS ENUM ('notice_sent', 'reminder_sent', 'confirmed', 'link_expired', 'paused', 'unreachable_notice_sent');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('open', 'collecting', 'cooling_off', 'cancellation_window', 'release_authorized', 'releasing', 'released', 'recovered', 'disputed', 'cancelled');

-- CreateEnum
CREATE TYPE "AttestationPosition" AS ENUM ('believe_deceased', 'reached_alive', 'unknown', 'dispute');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'sent', 'failed', 'bounced', 'cancelled');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('terms', 'privacy', 'sms_check_in', 'voice_replica', 'likeness_replica', 'avatar_posthumous_use');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "deletion_requested_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "check_in_channel_email" BOOLEAN NOT NULL DEFAULT true,
    "check_in_channel_sms" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsules" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CapsuleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "capsules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_items" (
    "id" UUID NOT NULL,
    "capsule_id" UUID NOT NULL,
    "kind" "ItemKind" NOT NULL DEFAULT 'letter',
    "title" TEXT NOT NULL,
    "body_ciphertext" BYTEA,
    "body_nonce" BYTEA,
    "body_tag" BYTEA,
    "status" "ItemStatus" NOT NULL DEFAULT 'draft',
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "capsule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_media" (
    "item_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "item_media_pkey" PRIMARY KEY ("item_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "linked_user_id" UUID,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "relationship" TEXT,
    "time_zone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_roles" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role" "ContactRoleKind" NOT NULL,
    "channel_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_verification_tokens" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_grants" (
    "id" UUID NOT NULL,
    "capsule_item_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "visibility" "GrantVisibility" NOT NULL DEFAULT 'released_only',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "item_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_rules" (
    "id" UUID NOT NULL,
    "capsule_item_id" UUID NOT NULL,
    "trigger" "ReleaseTrigger" NOT NULL,
    "time_zone" TEXT NOT NULL,
    "local_date" TEXT,
    "local_time" TEXT,
    "next_run_at" TIMESTAMPTZ(6),
    "status" "ReleaseRuleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "release_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_jobs" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "release_rule_id" UUID,
    "verification_case_id" UUID,
    "capsule_item_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "occurrence_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ReleaseJobStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "release_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_policies" (
    "user_id" UUID NOT NULL,
    "interval_days" INTEGER NOT NULL DEFAULT 30,
    "paused_until" TIMESTAMPTZ(6),
    "next_due_at" TIMESTAMPTZ(6) NOT NULL,
    "reminder_offsets" JSONB NOT NULL,
    "unreachable_after_days" INTEGER NOT NULL DEFAULT 21,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "check_in_policies_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "check_in_cycles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "state" "CheckInCycleState" NOT NULL DEFAULT 'due',
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmation_method" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_events" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "type" "CheckInEventType" NOT NULL,
    "offset_days" INTEGER,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "notification_id" UUID,

    CONSTRAINT "check_in_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_cases" (
    "id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "state" "VerificationState" NOT NULL,
    "opened_by_person_id" UUID NOT NULL,
    "quorum_required" INTEGER NOT NULL,
    "quorum_of" INTEGER NOT NULL,
    "cooling_off_ends_at" TIMESTAMPTZ(6),
    "cancellation_window_ends_at" TIMESTAMPTZ(6),
    "resolution" TEXT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestations" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "position" "AttestationPosition" NOT NULL,
    "note" TEXT,
    "attested_at" TIMESTAMPTZ(6) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(6),

    CONSTRAINT "attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template_id" TEXT NOT NULL,
    "destination_hash" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "related_type" TEXT NOT NULL,
    "related_id" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "policy_version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "source" TEXT NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_clock" (
    "id" INTEGER NOT NULL,
    "simulated_now" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dev_clock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_messages" (
    "id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "capsules_owner_user_id_idx" ON "capsules"("owner_user_id");

-- CreateIndex
CREATE INDEX "capsule_items_capsule_id_status_idx" ON "capsule_items"("capsule_id", "status");

-- CreateIndex
CREATE INDEX "media_assets_owner_user_id_status_idx" ON "media_assets"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "persons_owner_user_id_idx" ON "persons"("owner_user_id");

-- CreateIndex
CREATE INDEX "contact_roles_person_id_idx" ON "contact_roles"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_verification_tokens_token_hash_key" ON "contact_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "item_grants_person_id_idx" ON "item_grants"("person_id");

-- CreateIndex
CREATE INDEX "item_grants_capsule_item_id_idx" ON "item_grants"("capsule_item_id");

-- CreateIndex
CREATE INDEX "release_rules_next_run_at_idx" ON "release_rules"("next_run_at");

-- CreateIndex
CREATE INDEX "release_rules_capsule_item_id_idx" ON "release_rules"("capsule_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_jobs_idempotency_key_key" ON "release_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "release_jobs_status_occurrence_at_idx" ON "release_jobs"("status", "occurrence_at");

-- CreateIndex
CREATE INDEX "check_in_policies_next_due_at_idx" ON "check_in_policies"("next_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_cycles_user_id_due_at_key" ON "check_in_cycles"("user_id", "due_at");

-- CreateIndex
CREATE INDEX "check_in_events_cycle_id_at_idx" ON "check_in_events"("cycle_id", "at");

-- CreateIndex
CREATE INDEX "verification_cases_subject_user_id_idx" ON "verification_cases"("subject_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attestations_case_id_person_id_key" ON "attestations"("case_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_key" ON "notification_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_related_type_related_id_idx" ON "notification_deliveries"("related_type", "related_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "dev_messages_created_at_idx" ON "dev_messages"("created_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_items" ADD CONSTRAINT "capsule_items_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_media" ADD CONSTRAINT "item_media_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "capsule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_media" ADD CONSTRAINT "item_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_verification_tokens" ADD CONSTRAINT "contact_verification_tokens_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_grants" ADD CONSTRAINT "item_grants_capsule_item_id_fkey" FOREIGN KEY ("capsule_item_id") REFERENCES "capsule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_grants" ADD CONSTRAINT "item_grants_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_rules" ADD CONSTRAINT "release_rules_capsule_item_id_fkey" FOREIGN KEY ("capsule_item_id") REFERENCES "capsule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_jobs" ADD CONSTRAINT "release_jobs_release_rule_id_fkey" FOREIGN KEY ("release_rule_id") REFERENCES "release_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_jobs" ADD CONSTRAINT "release_jobs_verification_case_id_fkey" FOREIGN KEY ("verification_case_id") REFERENCES "verification_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_jobs" ADD CONSTRAINT "release_jobs_capsule_item_id_fkey" FOREIGN KEY ("capsule_item_id") REFERENCES "capsule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_jobs" ADD CONSTRAINT "release_jobs_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_policies" ADD CONSTRAINT "check_in_policies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_cycles" ADD CONSTRAINT "check_in_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_events" ADD CONSTRAINT "check_in_events_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "check_in_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_opened_by_person_id_fkey" FOREIGN KEY ("opened_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "verification_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial uniqueness and append-only history
CREATE UNIQUE INDEX "contact_roles_active_role" ON "contact_roles" ("person_id", "role") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "item_grants_active_unique" ON "item_grants" ("capsule_item_id", "person_id") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "release_rules_one_active" ON "release_rules" ("capsule_item_id") WHERE "status" IN ('active', 'paused');
CREATE UNIQUE INDEX "verification_cases_one_open" ON "verification_cases" ("subject_user_id") WHERE "state" NOT IN ('recovered', 'cancelled', 'released');

CREATE OR REPLACE FUNCTION digi_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_in_events_append_only
  BEFORE UPDATE OR DELETE ON check_in_events
  FOR EACH ROW EXECUTE FUNCTION digi_append_only();

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION digi_append_only();
