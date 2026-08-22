import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type StoredAlias = {
  id: string;
  matchKey: string;
  correctedTo: string;
};

export interface AliasApplication {
  /** 画面に出す値。辞書がヒットしていれば確定済み表記に置き換わっている。 */
  value: string;
  /** 辞書を適用したか。UI のバッジ表示に使う。 */
  applied: boolean;
}

export interface RecordEntry {
  /** OCR が読んだ生の値（辞書適用後の値ではない）。 */
  ocrValue: string;
  /** ユーザーが保存時に確定した値。 */
  confirmedValue: string;
}

@Injectable()
export class NamingMemoryService {
  private readonly logger = new Logger(NamingMemoryService.name);

  /** 部分一致フォールバックの最小キー長。短すぎるキーは誤適用の元になる。 */
  private static readonly MIN_PARTIAL_KEY_LENGTH = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 取引先名の照合キーを作る。
   * OCR は同じ会社を「㈱ロード商事」「株式会社 ロード商事」のように毎回わずかに違う形で読むため、
   * 表記ゆれを吸収してから辞書を引く。
   */
  normalizeKey(value: string): string {
    if (!value) return '';
    return value
      .normalize('NFKC')
      .replace(
        /株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|社会福祉法人|一般社団法人|一般財団法人|\(株\)|\(有\)|Inc\.?|Co\.?,?\s*Ltd\.?|LLC|Ltd\.?|Corp\.?/gi,
        '',
      )
      .replace(/[\s　]+/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * タブの辞書を使い、OCR が読んだ社名を過去の確定表記へ置き換える。
   * 学習は補助機能なので、辞書が引けない場合でも読み取り結果はそのまま返す。
   */
  async applyToCompanies(tabId: string, values: string[]): Promise<AliasApplication[]> {
    const untouched = values.map((value) => ({ value, applied: false }));
    if (!tabId || values.length === 0) return untouched;

    let aliases: StoredAlias[];
    try {
      aliases = await this.prisma.vendorAlias.findMany({
        where: { tabId },
        select: { id: true, matchKey: true, correctedTo: true },
      });
    } catch (err) {
      this.logger.error('Failed to load vendor aliases', err as Error);
      return untouched;
    }

    if (aliases.length === 0) return untouched;

    const exact = new Map(aliases.map((alias) => [alias.matchKey, alias]));
    const hitIds = new Set<string>();

    const results = values.map((value) => {
      const key = this.normalizeKey(value);
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

  /**
   * 完全一致しなかったときの保険。
   * 「ローソン」で覚えた辞書で「ローソン金沢駅前店」を拾えるようにする。
   * 誤適用を避けるため、両者が最小長を満たす場合のみ、最も長いキーを採用する。
   */
  private findPartialMatch(aliases: StoredAlias[], key: string): StoredAlias | null {
    if (key.length < NamingMemoryService.MIN_PARTIAL_KEY_LENGTH) return null;

    let best: StoredAlias | null = null;
    for (const alias of aliases) {
      if (alias.matchKey.length < NamingMemoryService.MIN_PARTIAL_KEY_LENGTH) continue;
      if (!key.includes(alias.matchKey) && !alias.matchKey.includes(key)) continue;
      if (!best || alias.matchKey.length > best.matchKey.length) best = alias;
    }
    return best;
  }

  /**
   * 保存確定時の学習。
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
      const ocrValue = entry.ocrValue?.trim() ?? '';
      const confirmedValue = entry.confirmedValue?.trim() ?? '';

      // 直していない、または片方が空なら覚えることがない。
      if (!ocrValue || !confirmedValue || ocrValue === confirmedValue) continue;

      const matchKey = this.normalizeKey(ocrValue);
      if (!matchKey) continue;

      try {
        await this.prisma.vendorAlias.upsert({
          where: { tabId_matchKey: { tabId, matchKey } },
          // 直近の確定値を正とする（社内で呼び方が変わった場合に追随できる）。
          update: {
            correctedTo: confirmedValue,
            sourceValue: ocrValue,
            updatedBy: updatedBy ?? null,
          },
          create: {
            tabId,
            matchKey,
            correctedTo: confirmedValue,
            sourceValue: ocrValue,
            updatedBy: updatedBy ?? null,
          },
        });
        learned += 1;
      } catch (err) {
        // 学習の失敗で保存操作そのものを失敗させない。
        this.logger.error(`Failed to record vendor alias for "${ocrValue}"`, err as Error);
      }
    }

    return { learned };
  }

  list(tabId: string) {
    return this.prisma.vendorAlias.findMany({
      where: { tabId },
      orderBy: [{ hitCount: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  remove(id: string) {
    return this.prisma.vendorAlias.delete({ where: { id } });
  }
}
