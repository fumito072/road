-- 学習対象の項目（company / documentType / carrier）を追加する。
-- 既存行はすべて社名の学習なので company を既定値にする。
ALTER TABLE "vendor_aliases" ADD COLUMN "field" TEXT NOT NULL DEFAULT 'company';

-- 一意制約とインデックスを項目込みに張り替える。
DROP INDEX "vendor_aliases_tabId_matchKey_key";
DROP INDEX "vendor_aliases_tabId_idx";

-- CreateIndex
CREATE INDEX "vendor_aliases_tabId_field_idx" ON "vendor_aliases"("tabId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_aliases_tabId_field_matchKey_key" ON "vendor_aliases"("tabId", "field", "matchKey");
