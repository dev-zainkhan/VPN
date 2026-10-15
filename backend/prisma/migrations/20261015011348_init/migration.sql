-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('android');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('provisioning', 'active', 'draining', 'failed', 'terminating', 'terminated');

-- CreateEnum
CREATE TYPE "ServerFailReason" AS ENUM ('launch_error', 'never_registered', 'agent_silent', 'instance_lost');

-- CreateEnum
CREATE TYPE "AwsAccountStatus" AS ENUM ('working', 'keys_rejected', 'disabled');

-- CreateEnum
CREATE TYPE "FreeTierPlan" AS ENUM ('legacy_12_month', 'free_plan_credits', 'paid');

-- CreateEnum
CREATE TYPE "Protocol" AS ENUM ('udp', 'tcp');

-- CreateEnum
CREATE TYPE "DefaultProtocol" AS ENUM ('auto', 'udp', 'tcp');

-- CreateEnum
CREATE TYPE "WalletReason" AS ENUM ('starter', 'ad_reward', 'admin_adjust');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('pending', 'credited', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "RewardOutcome" AS ENUM ('credited', 'rejected');

-- CreateEnum
CREATE TYPE "RejectReason" AS ENUM ('bad_signature', 'duplicate', 'wrong_ad_unit', 'stale', 'unknown_device', 'blocked', 'bad_intent', 'daily_limit');

-- CreateTable
CREATE TABLE "regions" (
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minutes_per_ad" INTEGER NOT NULL DEFAULT 30,
    "starter_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_ads_per_day" INTEGER NOT NULL DEFAULT 10,
    "low_minutes_warning" INTEGER NOT NULL DEFAULT 10,
    "default_protocol" "DefaultProtocol" NOT NULL DEFAULT 'auto',
    "support_email" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abuse_keys" (
    "key_hash" TEXT NOT NULL,
    "starter_granted" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "blocked_at" TIMESTAMP(3),
    "install_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abuse_keys_pkey" PRIMARY KEY ("key_hash")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "abuse_key_hash" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "app_version" TEXT NOT NULL,
    "balance_seconds" INTEGER NOT NULL DEFAULT 0,
    "ads_today" INTEGER NOT NULL DEFAULT 0,
    "ads_day" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "seconds" INTEGER NOT NULL,
    "reason" "WalletReason" NOT NULL,
    "ref_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aws_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nickname" TEXT NOT NULL,
    "aws_account_number" TEXT NOT NULL,
    "access_key_id_enc" TEXT NOT NULL,
    "secret_access_key_enc" TEXT NOT NULL,
    "access_key_last4" TEXT NOT NULL,
    "status" "AwsAccountStatus" NOT NULL DEFAULT 'working',
    "free_tier_plan" "FreeTierPlan" NOT NULL DEFAULT 'legacy_12_month',
    "last_checked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aws_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_regions" (
    "aws_account_id" UUID NOT NULL,
    "region_code" TEXT NOT NULL,
    "vpc_id" TEXT NOT NULL,
    "security_group_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_regions_pkey" PRIMARY KEY ("aws_account_id","region_code")
);

-- CreateTable
CREATE TABLE "account_usage" (
    "aws_account_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "tx_bytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "account_usage_pkey" PRIMARY KEY ("aws_account_id","month")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aws_account_id" UUID NOT NULL,
    "region_code" TEXT NOT NULL,
    "instance_id" TEXT,
    "instance_type" TEXT NOT NULL,
    "public_ip" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'provisioning',
    "fail_reason" "ServerFailReason",
    "fail_detail" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "wg_public_key" TEXT,
    "tcp_cert_sha256" TEXT,
    "bootstrap_token_hash" TEXT,
    "agent_token_hash" TEXT,
    "agent_version" TEXT,
    "peers_version" INTEGER NOT NULL DEFAULT 1,
    "applied_version" INTEGER NOT NULL DEFAULT 0,
    "last_report_at" TIMESTAMP(3),
    "cpu_pct" DOUBLE PRECISION,
    "mem_pct" DOUBLE PRECISION,
    "tx_counter" BIGINT NOT NULL DEFAULT 0,
    "launched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_at" TIMESTAMP(3),
    "terminated_at" TIMESTAMP(3),

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "protocol" "Protocol" NOT NULL,
    "public_key" TEXT NOT NULL,
    "tunnel_ip" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_handshake_at" TIMESTAMP(3),
    "last_debit_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "nonce" TEXT NOT NULL,
    "status" "IntentStatus" NOT NULL DEFAULT 'pending',
    "reject_reason" "RejectReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" TEXT NOT NULL,
    "device_id" UUID,
    "intent_id" UUID,
    "ad_unit" TEXT NOT NULL,
    "reward_amount" INTEGER NOT NULL,
    "reward_item" TEXT NOT NULL,
    "outcome" "RewardOutcome" NOT NULL,
    "reject_reason" "RejectReason",
    "seconds_credited" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reject_counters" (
    "day" TEXT NOT NULL,
    "reason" "RejectReason" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reject_counters_pkey" PRIMARY KEY ("day","reason")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "admin_audits_created_at_idx" ON "admin_audits"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_token_hash_key" ON "devices"("token_hash");

-- CreateIndex
CREATE INDEX "devices_abuse_key_hash_idx" ON "devices"("abuse_key_hash");

-- CreateIndex
CREATE INDEX "devices_first_seen_at_id_idx" ON "devices"("first_seen_at", "id");

-- CreateIndex
CREATE INDEX "wallet_entries_device_id_created_at_idx" ON "wallet_entries"("device_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "aws_accounts_nickname_key" ON "aws_accounts"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "aws_accounts_aws_account_number_key" ON "aws_accounts"("aws_account_number");

-- CreateIndex
CREATE UNIQUE INDEX "servers_instance_id_key" ON "servers"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "servers_agent_token_hash_key" ON "servers"("agent_token_hash");

-- CreateIndex
CREATE INDEX "servers_status_idx" ON "servers"("status");

-- CreateIndex
CREATE INDEX "servers_region_code_status_idx" ON "servers"("region_code", "status");

-- CreateIndex
CREATE INDEX "servers_aws_account_id_idx" ON "servers"("aws_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_device_id_key" ON "sessions"("device_id");

-- CreateIndex
CREATE INDEX "sessions_server_id_idx" ON "sessions"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_server_id_tunnel_ip_key" ON "sessions"("server_id", "tunnel_ip");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_server_id_public_key_key" ON "sessions"("server_id", "public_key");

-- CreateIndex
CREATE UNIQUE INDEX "reward_intents_nonce_key" ON "reward_intents"("nonce");

-- CreateIndex
CREATE INDEX "reward_intents_device_id_created_at_idx" ON "reward_intents"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "reward_intents_status_expires_at_idx" ON "reward_intents"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_rewards_transaction_id_key" ON "ad_rewards"("transaction_id");

-- CreateIndex
CREATE INDEX "ad_rewards_created_at_idx" ON "ad_rewards"("created_at");

-- CreateIndex
CREATE INDEX "ad_rewards_device_id_created_at_idx" ON "ad_rewards"("device_id", "created_at");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audits" ADD CONSTRAINT "admin_audits_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_abuse_key_hash_fkey" FOREIGN KEY ("abuse_key_hash") REFERENCES "abuse_keys"("key_hash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_regions" ADD CONSTRAINT "account_regions_aws_account_id_fkey" FOREIGN KEY ("aws_account_id") REFERENCES "aws_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_regions" ADD CONSTRAINT "account_regions_region_code_fkey" FOREIGN KEY ("region_code") REFERENCES "regions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_usage" ADD CONSTRAINT "account_usage_aws_account_id_fkey" FOREIGN KEY ("aws_account_id") REFERENCES "aws_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_aws_account_id_fkey" FOREIGN KEY ("aws_account_id") REFERENCES "aws_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_region_code_fkey" FOREIGN KEY ("region_code") REFERENCES "regions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_intents" ADD CONSTRAINT "reward_intents_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
