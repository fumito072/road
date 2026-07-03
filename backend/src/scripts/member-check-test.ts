import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { OcrService } from '../ocr/ocr.service';
import { SalesforceService } from '../salesforce/salesforce.service';

// 名簿OCR → Salesforce照合 の一気通貫テスト。
// Usage: npx ts-node src/scripts/member-check-test.ts [画像パス]
async function main() {
  loadEnv();

  const imagePath = process.argv[2]
    ? process.argv[2]
    : join(process.cwd(), '..', 'S__5914712.jpg');

  const config = new ConfigService();
  const ocr = new OcrService(config);
  const salesforce = new SalesforceService(config);

  if (!salesforce.isConfigured()) {
    console.error('❌ Salesforce未設定です（.env を確認）。');
    process.exit(1);
  }

  console.log(`① 名簿OCR抽出: ${imagePath}`);
  const result = await ocr.extractPeopleList({
    storagePath: imagePath,
    mimeType: 'image/jpeg',
    originalFileName: 'roster.jpg',
  });
  console.log(`   抽出 ${result.people.length}名 / confidence=${result.confidence}\n`);

  console.log('② Salesforce照合（顧客担当者 + 取引先担当者）\n');
  let hitCount = 0;
  for (const p of result.people) {
    const sf = await salesforce.searchPeople({
      lastName: p.lastName,
      firstName: p.firstName,
      fullName: p.fullName,
      kana: p.kana,
    });
    const head = `[${p.group || '－'}] ${p.fullName || `${p.lastName}${p.firstName}`}（${p.kana || '?'}）HDCP:${p.handicap || '－'}${p.note ? ` / ${p.note}` : ''}`;
    if (sf.matchCount > 0) {
      hitCount += 1;
      const detail = sf.matches
        .map((m) => `${m.sourceLabel}:${m.name}${m.company ? `(${m.company})` : ''}`)
        .join(' , ');
      console.log(`  ✅ ${head}\n       → ${sf.matchCount}件: ${detail}`);
    } else {
      console.log(`  ⬜ ${head}\n       → 未登録（該当なし）`);
    }
  }

  console.log(`\n=== 結果: ${result.people.length}名中 ${hitCount}名がSalesforceに該当 ===`);
}

main().catch((e) => {
  console.error('FATAL:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
