-- AlterEnum
ALTER TYPE "WalletReason" ADD VALUE 'daily';

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "daily_top_up_day" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "daily_free_minutes" INTEGER NOT NULL DEFAULT 60;
