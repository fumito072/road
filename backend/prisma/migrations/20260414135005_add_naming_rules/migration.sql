-- CreateTable
CREATE TABLE "naming_rules" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "naming_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "naming_rules_tabId_idx" ON "naming_rules"("tabId");

-- AddForeignKey
ALTER TABLE "naming_rules" ADD CONSTRAINT "naming_rules_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
