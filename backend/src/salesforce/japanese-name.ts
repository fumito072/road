/**
 * 人名照合用の旧字体・異体字。先頭を比較用の代表字とする。
 * 同音という理由だけでは統合しない（例: 加藤/加東、斉藤/斉東）。
 * 原本・Salesforce の表示名には適用しない。
 */
const NAME_VARIANT_GROUPS = [
  '崎﨑', '斉斎齊齋', '高髙', '辺邊邉', '沢澤', '浜濱濵',
  '吉𠮷', '塚塚', '徳德', '恵惠',
  '国國', '広廣', '桜櫻', '桧檜', '竜龍', '滝瀧', '島嶋嶌',
  '富冨', '峰峯', '真眞', '槙槇', '関關', '会會', '万萬',
  '与與', '弥彌', '寿壽', '亀龜', '円圓', '栄榮', '楽樂',
  '渋澁', '浅淺', '淵渕渊', '黒黑',
  '豊豐', '礼禮', '禄祿', '祢禰', '称稱', '稲稻', '穂穗',
  '実實', '秋穐龝', '条條', '桑桒', '柳栁', '梅梅', '松枩',
  '柏栢', '児兒', '宝寶寳', '蔵藏', '薮藪籔', '篠筱',
  '奥奧', '横橫', '灯燈', '鉄鐵', '鉱鑛',
  '瀬瀨', '塩鹽', '学學', '旧舊', '巻卷',
  '荘莊', '翠翆', '静靜', '聡聰', '聴聽',
  '尭堯', '暁曉', '晃晄', '晋晉', '彦彥', '顕顯',
  '頼賴', '剣劍劒剱劔', '勲勳', '勧勸', '慎愼',
  '隠隱', '隆隆', '経經', '継繼', '総總',
  '緑綠', '緒緖', '縁緣', '絵繪', '糸絲', '尽盡', '誉譽',
];

const canonicalCharacters = new Map<string, string>();
const variantCharacters = new Map<string, Set<string>>();

function registerGroup(characters: string[]): void {
  const canonical = canonicalCharacters.get(characters[0]) ?? characters[0];
  const variants = variantCharacters.get(canonical) ?? new Set([canonical]);
  for (const character of characters) {
    canonicalCharacters.set(character, canonical);
    variants.add(character);
  }
  variantCharacters.set(canonical, variants);
}

for (const group of NAME_VARIANT_GROUPS) registerGroup(Array.from(group));

// Unicode 互換漢字（神/神、福/福など）も
// NFKC の定義から逆引きし、Salesforce に旧表記がある場合も検索できるようにする。
for (const [start, end] of [[0xf900, 0xfaff], [0x2f800, 0x2fa1f]]) {
  for (let codePoint = start; codePoint <= end; codePoint += 1) {
    const character = String.fromCodePoint(codePoint);
    const normalized = character.normalize('NFKC');
    if (normalized !== character) registerGroup([normalized, character]);
  }
}

export function normalizeJapaneseName(value: string): string {
  return Array.from(
    value.normalize('NFKC').replace(/[\s\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '').toLowerCase(),
    (character) => canonicalCharacters.get(character) ?? character,
  ).join('');
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\'%_]/g, (character) => `\\${character}`);
}

/**
 * SOQL LIKE に使うエスケープ済みパターン。
 * 文字間の % は空白・IVS を許容するため。取得後は必ず正規化して再照合する。
 * 組み合わせが多い名前は文字ワイルドカードへ切り替え、検索式の膨張を防ぐ。
 */
export function japaneseNameLikePatterns(value: string): string[] {
  const characters = Array.from(normalizeJapaneseName(value));
  if (characters.length === 0) return [];
  const choices = characters.map((character) =>
    Array.from(variantCharacters.get(character) ?? [character]),
  );
  const count = choices.reduce((total, variants) => total * variants.length, 1);
  if (count > 64) {
    return [`%${choices.map((variants) => variants.length > 1 ? '_' : escapeLikeLiteral(variants[0])).join('%')}%`];
  }
  let patterns = ['%'];
  for (const variants of choices) {
    patterns = patterns.flatMap((prefix) => variants.map((character) => `${prefix}${escapeLikeLiteral(character)}%`));
  }
  return patterns;
}
