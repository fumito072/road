const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ConfigService } = require('@nestjs/config');
const { normalizeJapaneseName, japaneseNameLikePatterns } = require('../src/salesforce/japanese-name');
const { SalesforceService } = require('../src/salesforce/salesforce.service');
const { MemberCheckService } = require('../src/member-check/member-check.service');

// SOQL LIKE の文字・ワイルドカード・エスケープを解釈して、生成した検索式も検証する。
function matchesLike(pattern, value) {
  const characters = Array.from(pattern);
  let expression = '';
  const literal = (character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < characters.length; i += 1) {
    const character = characters[i];
    if (character === '\\') expression += literal(characters[++i]);
    else if (character === '%') expression += '[\\s\\S]*';
    else if (character === '_') expression += '[\\s\\S]';
    else expression += literal(character);
  }
  return new RegExp(`^${expression}$`, 'iu').test(value);
}

function fieldPatterns(soql, field) {
  return Array.from(soql.matchAll(new RegExp(`${field} LIKE '((?:\\\\.|[^'\\\\])*)'`, 'g')), (match) => match[1]);
}

const surnameGroups = [
  ['山崎', '山﨑'], ['斉藤', '斎藤', '齊藤', '齋藤'], ['高橋', '髙橋'],
  ['渡辺', '渡邊', '渡邉'], ['沢田', '澤田'], ['浜田', '濱田', '濵田'],
  ['吉田', '𠮷田'], ['神田', '神田'], ['福田', '福田'], ['国広', '國廣'],
];

test('旧字体・異体字は双方向に検索でき、比較キーも一致する', () => {
  for (const group of surnameGroups) {
    for (const input of group) {
      for (const stored of group) {
        assert.equal(normalizeJapaneseName(input), normalizeJapaneseName(stored));
        assert.ok(japaneseNameLikePatterns(input).some((pattern) => matchesLike(pattern, stored)), `${input} → ${stored}`);
      }
    }
  }
  assert.equal(normalizeJapaneseName('德藏'), normalizeJapaneseName('徳蔵'));
  assert.equal(normalizeJapaneseName('眞一'), normalizeJapaneseName('真一'));
});

test('空白・全半角・IVS を比較時に吸収し、互換漢字を逆引きする', () => {
  assert.equal(normalizeJapaneseName(' 山﨑　太郎\u{E0100} '), '山崎太郎');
  assert.equal(normalizeJapaneseName('ＡＢＣ　ﾀﾛｳ'), 'abcタロウ');
  assert.equal(normalizeJapaneseName('辻\uFE00田'), '辻田');
  assert.ok(japaneseNameLikePatterns('辻田').some((pattern) => matchesLike(pattern, '辻\u{E0100} 田')));
  assert.ok(japaneseNameLikePatterns('神田').some((pattern) => matchesLike(pattern, '神田')));
  assert.deepEqual(japaneseNameLikePatterns('　\u{E0100}'), []);
});

test('同音の別姓や別の漢字は統合しない', () => {
  for (const [a, b] of [['加藤', '加東'], ['斉藤', '斉東'], ['山崎', '山埼'], ['栗田', '粟田'], ['脇田', '脅田']]) {
    assert.notEqual(normalizeJapaneseName(a), normalizeJapaneseName(b));
  }
});

test('大量の異体字の組み合わせでも検索式を制限し、後方の組み合わせを落とさない', () => {
  const patterns = japaneseNameLikePatterns('斎斎斎斎');
  assert.equal(patterns.length, 1);
  assert.ok(matchesLike(patterns[0], '齋齊斉斎'));
  assert.equal(normalizeJapaneseName('斎斎斎斎'), normalizeJapaneseName('齋齊斉斎'));
});

test('引用符・バックスラッシュ・LIKE ワイルドカードをリテラルとして扱う', () => {
  for (const name of ["O'Neil", 'a\\b', 'a%b', 'a_b']) {
    const patterns = japaneseNameLikePatterns(name);
    assert.ok(patterns.some((pattern) => matchesLike(pattern, name)));
    assert.ok(patterns.every((pattern) => !matchesLike(pattern, 'axxxb')));
  }
});

function mockSalesforce(t, handler, configured = true) {
  const config = new ConfigService(configured ? {
    SALESFORCE_CONSUMER_KEY: 'test-key', SALESFORCE_CONSUMER_SECRET: 'test-secret',
  } : {});
  const queries = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/token')) {
      return Response.json({ access_token: 'test-token', instance_url: 'https://example.salesforce.test' });
    }
    assert.equal(options.headers['Sforce-Query-Options'], 'batchSize=200');
    const soql = url.searchParams.get('q');
    if (soql) queries.push(soql);
    return Response.json(await handler({ soql, path: url.pathname }));
  });
  return { service: new SalesforceService(config), queries };
}

test('Contact・独自担当者の両方で、姓と名の異体字を検索して元の表記で返す', async (t) => {
  const { service, queries } = mockSalesforce(t, ({ soql }) => {
    const custom = soql.includes('FROM CustomObject_');
    assert.ok(soql.includes(' AND '));
    const lastPatterns = fieldPatterns(soql, custom ? 'sei__c' : 'Name');
    const firstPatterns = fieldPatterns(soql, custom ? 'name__c' : 'Name');
    assert.ok(lastPatterns.some((pattern) => matchesLike(pattern, '齋藤')));
    assert.ok(firstPatterns.some((pattern) => matchesLike(pattern, '德藏')));
    return { records: custom ? [
      { Id: 'custom1', sei__c: '齊藤', name__c: '齋藤　德藏', furigana__c: 'サイトウトクゾウ', torihikisaki_name__c: 'テスト会社' },
      { Id: 'custom2', sei__c: '斉東', name__c: '斉東 徳蔵' },
    ] : [
      { Id: 'contact1', Name: '齋藤　德藏', Account: { Name: 'テスト会社' } },
      { Id: 'contact2', Name: '斎遠藤 徳蔵' },
      { Id: 'contact3', Name: '斎藤 次郎' },
    ] };
  });
  const result = await service.searchPeople({ lastName: '斉藤', firstName: '徳蔵' });
  assert.equal(queries.length, 2);
  assert.equal(result.exists, true);
  assert.equal(result.matchCount, 2);
  assert.deepEqual(result.matches.map((match) => match.name), ['齋藤　德藏', '齋藤　德藏']);
  assert.deepEqual(result.matches.map((match) => match.source), ['contact', 'torihikisaki_tantou']);
  assert.equal(result.query, '斉藤 徳蔵');
});

test('fullName のみ・姓のみ・名のみからも検索できる', async (t) => {
  const { service } = mockSalesforce(t, ({ soql }) => ({ records: soql.includes('FROM Contact')
    ? [{ Id: 'c1', Name: '山崎 眞一' }]
    : [{ Id: 'x1', sei__c: '山崎', name__c: '山崎 眞一' }],
  }));
  for (const input of [{ fullName: '山﨑　真一' }, { lastName: '山﨑' }, { firstName: '真一' }, { fullName: '山﨑真一' }]) {
    const result = await service.searchPeople(input);
    assert.equal(result.matchCount, 2);
  }
});

test('不一致候補の次ページを読み、照合できた候補を最大10件返す', async (t) => {
  let followedPage = false;
  const { service } = mockSalesforce(t, ({ soql, path }) => {
    if (path.endsWith('/next-page')) {
      followedPage = true;
      return { records: Array.from({ length: 12 }, (_, i) => ({ Id: `c${i}`, Name: '山﨑 太郎' })) };
    }
    if (soql.includes('FROM Contact')) {
      assert.ok(!soql.includes('LIMIT 10'));
      return {
        records: Array.from({ length: 10 }, (_, i) => ({ Id: `wrong${i}`, Name: '山田崎 太郎' })),
        nextRecordsUrl: '/services/data/v59.0/query/next-page',
      };
    }
    return { records: [] };
  });
  const result = await service.searchPeople({ lastName: '山崎', firstName: '太郎' });
  assert.equal(followedPage, true);
  assert.equal(result.matchCount, 10);
  assert.ok(result.matches.every((match) => match.name === '山﨑 太郎'));
});

test('空の氏名や未設定時は外部問い合わせをしない', async (t) => {
  const { service, queries } = mockSalesforce(t, () => { throw new Error('unexpected fetch'); });
  for (const input of [{}, { fullName: '　' }, { lastName: '\u{E0100}' }]) {
    assert.equal((await service.searchPeople(input)).exists, false);
  }
  assert.equal(queries.length, 0);
  const unconfigured = new SalesforceService(new ConfigService({}));
  assert.equal((await unconfigured.searchPeople({ lastName: '山崎' })).configured, false);
});

test('異体字違いの名簿行は消さずに重複警告し、完全な二重読取だけ除去する', async () => {
  const base = { lastName: '山崎', firstName: '太郎', fullName: '山崎 太郎', kana: '', group: '1', handicap: '', note: '' };
  const variant = { ...base, lastName: '山﨑', fullName: '山﨑 太郎' };
  const ocr = { extractPeopleList: async () => ({ people: [base, variant, { ...base }], confidence: 0.9 }) };
  const salesforce = {
    isConfigured: () => true,
    searchPeople: async () => ({ configured: true, exists: true, matchCount: 1, matches: [] }),
  };
  const result = await new MemberCheckService(ocr, salesforce).scanRoster([
    { buffer: Buffer.from('test'), mimeType: 'image/png', originalFileName: 'test.png' },
  ]);
  assert.equal(result.totalPeople, 2);
  assert.equal(result.removedDuplicates, 1);
  assert.equal(result.duplicateWarningCount, 2);
  assert.equal(result.matchedCount, 2);
  assert.deepEqual(result.people.map((person) => person.lastName), ['山崎', '山﨑']);
});
