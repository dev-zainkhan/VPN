/*
  Warnings:

  - You are about to drop the column `daily_top_up_day` on the `devices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "abuse_keys" ADD COLUMN     "daily_top_up_day" TEXT;

-- AlterTable
ALTER TABLE "devices" DROP COLUMN "daily_top_up_day";
