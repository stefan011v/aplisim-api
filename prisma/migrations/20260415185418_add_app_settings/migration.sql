-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appName" TEXT DEFAULT 'APLISIM Business Console',
    "supportEmail" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Belgrade',
    "defaultTicketStatus" TEXT NOT NULL DEFAULT 'new',
    "defaultTicketPriority" TEXT NOT NULL DEFAULT 'medium',
    "defaultTicketCategory" TEXT NOT NULL DEFAULT 'general',
    "defaultLeadStatus" TEXT NOT NULL DEFAULT 'new',
    "defaultLeadSource" TEXT NOT NULL DEFAULT 'website',
    "defaultClientStatus" TEXT NOT NULL DEFAULT 'prospect',
    "defaultPrimaryService" TEXT NOT NULL DEFAULT 'web-app-development',
    "defaultPackageName" TEXT,
    "notifyOnAccessRequest" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnNewTicket" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnLeadCreated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);
