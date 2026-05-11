-- AlterTable
ALTER TABLE "AccessRequest" ADD COLUMN     "clientId" INTEGER;

-- CreateIndex
CREATE INDEX "AccessRequest_clientId_idx" ON "AccessRequest"("clientId");

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
