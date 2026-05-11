-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "city" TEXT,
ADD COLUMN     "packageName" TEXT,
ADD COLUMN     "primaryService" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'prospect',
ADD COLUMN     "website" TEXT;
