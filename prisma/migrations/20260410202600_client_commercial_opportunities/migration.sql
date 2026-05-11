-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "proposalAmount" DOUBLE PRECISION,
ADD COLUMN     "proposalNotes" TEXT,
ADD COLUMN     "proposalSentAt" TIMESTAMP(3),
ADD COLUMN     "proposalStatus" TEXT;
