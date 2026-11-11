CREATE TABLE "mail_server_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password_cipher" BYTEA,
    "password_nonce" BYTEA,
    "password_tag" BYTEA,
    "encryption" TEXT NOT NULL DEFAULT 'starttls',
    "connection_status" TEXT NOT NULL DEFAULT 'unverified',
    "last_success_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "last_failure_code" TEXT,
    "sender_verified_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_server_settings_pkey" PRIMARY KEY ("id")
);
