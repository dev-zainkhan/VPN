-- DropForeignKey
ALTER TABLE "servers" DROP CONSTRAINT "servers_aws_account_id_fkey";

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "managed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "provider_name" TEXT,
ALTER COLUMN "aws_account_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_aws_account_id_fkey" FOREIGN KEY ("aws_account_id") REFERENCES "aws_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
