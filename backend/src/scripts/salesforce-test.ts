import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { SalesforceService } from '../salesforce/salesforce.service';

// Standalone connectivity check for the Salesforce JWT Bearer flow.
// Usage: npx ts-node src/scripts/salesforce-test.ts [検索する顧客名]
async function main() {
  loadEnv();

  const searchName = process.argv.slice(2).join(' ').trim();

  const configService = new ConfigService();
  const salesforce = new SalesforceService(configService);

  if (!salesforce.isConfigured()) {
    console.error(
      '❌ .env が未設定です。SALESFORCE_CONSUMER_KEY / SALESFORCE_CONSUMER_SECRET を設定してください。',
    );
    process.exit(1);
  }

  console.log('① トークン取得 + Contact 検索を試行します...');
  console.log(`   ログインURL: ${configService.get('SALESFORCE_LOGIN_URL') ?? 'https://login.salesforce.com'}`);

  try {
    // 検索語が無ければ、まず必ずヒットしないダミー語で疎通だけ確認する。
    const probe = searchName || '__connectivity_probe__';
    const result = await salesforce.searchContacts(probe);

    console.log('\n✅ Salesforce への接続に成功しました（トークン取得 + クエリ成功）。');
    console.log(`   検索語: "${result.query}"`);
    console.log(`   ヒット件数: ${result.matchCount}`);

    if (result.matches.length > 0) {
      console.log('   --- 一致した顧客担当者 (最大25件) ---');
      for (const match of result.matches) {
        const exact = match.exactMatch ? '[完全一致] ' : '';
        const account = match.accountName ? ` / 取引先: ${match.accountName}` : '';
        console.log(`   ${exact}${match.name}${account}`);
      }
    } else if (searchName) {
      console.log('   （該当する顧客担当者は見つかりませんでした）');
    }
  } catch (error) {
    console.error('\n❌ 失敗しました:', error instanceof Error ? error.message : error);
    console.error(
      '\nよくある原因（クライアントクレデンシャル方式）:\n' +
        '  - invalid_client / invalid_client_id: Consumer Key / Secret が違う、または入れ違い\n' +
        '  - unsupported_grant_type: Connected App で「クライアントクレデンシャルフロー」が未有効\n' +
        '  - invalid_grant (no run-as user): Connected App のポリシーで実行ユーザー(Run As)が未設定\n' +
        '  - LOGIN_URL は組織の My Domain (例: https://xxx.my.salesforce.com) が必要な場合あり',
    );
    process.exit(1);
  }
}

main();
