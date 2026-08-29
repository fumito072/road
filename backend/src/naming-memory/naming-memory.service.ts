import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type StoredAlias = {
  id: string;
  matchKey: string;
  correctedTo: string;
};

/**
 * 学習対象の項目。項目ごとに辞書を分けないと、別項目の同じ文字列が互いに干渉する。
 * - company      … 社名・顧客名
 * - documentType … 書類種別・明細の種類
 * - carrier      … キャリア名（請求元の事業者）
 */
export const NAMING_MEMORY_FIELDS = ['company', 'documentType', 'carrier'] as const;
export type NamingMemoryField = (typeof NAMING_MEMORY_FIELDS)[number];

export const DEFAULT_NAMING_MEMORY_FIELD: NamingMemoryField = 'company';

export interface AliasApplication {
  /** 画面に出す値。辞書がヒットしていれば確定済み表記に置き換わっている。 */
  value: string;
  /** 辞書を適用したか。UI のバッジ表示に使う。 */
  applied: boolean;
}

export interface RecordEntry {
  /** OCR が読んだ生の値（辞書適用後の値ではない）。 */
  ocrValue: string;
  /** ユーザーが確定した値。 */
  confirmedValue: string;
  /** 学習対象の項目。未指定なら company。 */
  field?: string;
}

@Injectable()
export class NamingMemoryService {
  private readonly logger = new Logger(NamingMemoryService.name);

  /** 前方一致フォールバックの最小キー長。短すぎるキーは誤適用の元になる。 */
  private static readonly MIN_PARTIAL_KEY_LENGTH = 3;

  constructor(private readonly prisma: PrismaService) {}

  /** 未知の項目名が来ても辞書を壊さないよう、既知の項目に丸める。 */
  normalizeField(field?: string): NamingMemoryField {
    const candidate = (field ?? '').trim() as NamingMemoryField;
    return NAMING_MEMORY_FIELDS.includes(candidate) ? candidate : DEFAULT_NAMING_MEMORY_FIELD;
  }

  /**
   * 照合キーを作る。
   * OCR は同じ対象を「㈱ロード商事」「株式会社 ロード商事」のように毎回わずかに違う形で読むため、
   * 表記ゆれを吸収してから辞書を引く。
   *
   * 会社種別（株式会社など）の除去は company のみに適用する。
   * 書類種別に対して行うと「合同会社設立書類」のような語を壊すため。
   */
  normalizeKey(value: string, field: NamingMemoryField = DEFAULT_NAMING_MEMORY_FIELD): string {
    if (!value) return '';

    let normalized = value.normalize('NFKC');

    if (field === 'company' || field === 'carrier') {
      normalized = normalized.replace(
        /株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|社会福祉法人|一般社団法人|一般財団法人|\(株\)|\(有\)|Inc\.?|Co\.?,?\s*Ltd\.?|LLC|Ltd\.?|Corp\.?/gi,
        '',
      );
    }

    return normalized
      .replace(/[\s　]+/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * タブの辞書を使い、OCR が読んだ値を過去の確定表記へ置き換える。
   * 学習は補助機能なので、辞書が引けない場合でも読み取り結果はそのまま返す。
   */
  async applyToValues(
    tabId: string,
    field: NamingMemoryField,
    values: string[],
  ): Promise<AliasApplication[]> {
    const untouched = values.map((value) => ({ value, applied: false }));
    if (!tabId || values.length === 0) return untouched;

    let aliases: StoredAlias[];
    try {
      aliases = await this.prisma.vendorAlias.findMany({
        where: { tabId, field },
        select: { id: true, matchKey: true, correctedTo: true },
      });
    } catch (err) {
      this.logger.error(`Failed to load vendor aliases (field=${field})`, err as Error);
      return untouched;
    }

    if (aliases.length === 0) return untouched;

    const exact = new Map(aliases.map((alias) => [alias.matchKey, alias]));
    const hitIds = new Set<string>();

    const results = values.map((value) => {
      const key = this.normalizeKey(value, field);
      if (!key) return { value, applied: false };

      const hit = exact.get(key) ?? this.findPartialMatch(aliases, key);
      if (!hit?.correctedTo) return { value, applied: false };

      hitIds.add(hit.id);
      return { value: hit.correctedTo, applied: true };
    });

    if (hitIds.size > 0) {
      await this.prisma.vendorAlias
        .updateMany({
          where: { id: { in: [...hitIds] } },
          data: { hitCount: { increment: 1 } },
        })
        .catch((err) => this.logger.error('Failed to increment hitCount', err as Error));
    }

    return results;
  }

  /** 社名の学習（既存の呼び出し互換）。 */
  applyToCompanies(tabId: string, values: string[]): Promise<AliasApplication[]> {
    return this.applyToValues(tabId, 'company', values);
  }

  /**
   * 完全一致しなかったときの保険。
   * 「ローソン」で覚えた辞書で「ローソン金沢駅前店」を拾えるようにする（支店名の付け外し対策）。
   *
   * 判定は「辞書のキーが、読み取り値の先頭に一致する」場合のみに限定している。
   * 単なる部分一致にすると、短い社名（例「ロード」）が無関係な長い辞書項目
   * （例「ロード商事金沢支店」）に巻き込まれて誤って置き換わるため。
   * 候補が複数あるときは、より具体的（長い）キーを採用する。
   */
  private findPartialMatch(aliases: StoredAlias[], key: string): StoredAlias | null {
    if (key.length < NamingMemoryService.MIN_PARTIAL_KEY_LENGTH) return null;

    let best: StoredAlias | null = null;
    for (const alias of aliases) {
      if (alias.matchKey.length < NamingMemoryService.MIN_PARTIAL_KEY_LENGTH) continue;
      if (!key.startsWith(alias.matchKey)) continue;
      if (!best || alias.matchKey.length > best.matchKey.length) best = alias;
    }
    return best;
  }

  /**
   * 「ファイル名へ反映」時の学習。
   *
   * ocrValue には必ず「AI が読んだ生の値」を渡すこと。辞書適用後の値をキーにすると
   * 別エントリが増えるだけで、元の誤読はいつまでも直らない。
   */
  async record(
    tabId: string,
    entries: RecordEntry[],
    updatedBy?: string | null,
  ): Promise<{ learned: number }> {
    if (!tabId || entries.length === 0) return { learned: 0 };

    let learned = 0;
    for (const entry of entries) {
      const field = this.normalizeField(entry.field);
      const ocrValue = entry.ocrValue?.trim() ?? '';
      const confirmedValue = entry.confirmedValue?.trim() ?? '';

      // 直していない、または片方が空なら覚えることがない。
      if (!ocrValue || !confirmedValue || ocrValue === confirmedValue) continue;

      const matchKey = this.normalizeKey(ocrValue, field);
      if (!matchKey) continue;

      try {
        await this.prisma.vendorAlias.upsert({
          where: { tabId_field_matchKey: { tabId, field, matchKey } },
          // 直近の確定値を正とする（社内で呼び方が変わった場合に追随できる）。
          update: {
            correctedTo: confirmedValue,
            sourceValue: ocrValue,
            updatedBy: updatedBy ?? null,
          },
          create: {
            tabId,
            field,
            matchKey,
            correctedTo: confirmedValue,
            sourceValue: ocrValue,
            updatedBy: updatedBy ?? null,
          },
        });
        learned += 1;
      } catch (err) {
        // 学習の失敗で保存操作そのものを失敗させない。
        this.logger.error(`Failed to record alias for "${ocrValue}" (field=${field})`, err as Error);
      }
    }

    return { learned };
  }

  list(tabId: string, field?: string) {
    return this.prisma.vendorAlias.findMany({
      where: { tabId, ...(field ? { field: this.normalizeField(field) } : {}) },
      orderBy: [{ field: 'asc' }, { hitCount: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  remove(id: string) {
    return this.prisma.vendorAlias.delete({ where: { id } });
  }
}
