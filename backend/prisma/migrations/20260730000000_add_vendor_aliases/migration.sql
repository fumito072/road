-- CreateTable
CREATE TABLE "vendor_aliases" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "correctedTo" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_aliases_tabId_idx" ON "vendor_aliases"("tabId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_aliases_tabId_matchKey_key" ON "vendor_aliases"("tabId", "matchKey");

-- AddForeignKey
ALTER TABLE "vendor_aliases" ADD CONSTRAINT "vendor_aliases_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
