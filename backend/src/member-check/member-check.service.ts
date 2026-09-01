import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ExtractedPerson, OcrService } from '../ocr/ocr.service';
import { SalesforcePersonSearchResult, SalesforceService } from '../salesforce/salesforce.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type ScanInput = {
  buffer: Buffer;
  mimeType: string;
  originalFileName: string;
};

export interface MemberCheckPerson extends ExtractedPerson {
  salesforce: SalesforcePersonSearchResult;
  /**
   * 同じ氏名の人が複数いる（完全一致ではない）ことを示す。
   * OCR の誤読の可能性と、実際の同姓同名の両方があり得るため、
   * 自動では消さずに原本確認を促す。
   */
  duplicateWarning: boolean;
}

export interface MemberCheckResult {
  totalPeople: number;
  matchedCount: number;
  confidence: number;
  salesforceConfigured: boolean;
  /** 全項目が同一で自動除去した件数（同じページの二重読み・同一ファイルの重複投入など）。 */
  removedDuplicates: number;
  /** 氏名が重複していて確認が必要な人数。 */
  duplicateWarningCount: number;
  people: MemberCheckPerson[];
}

export type MemberCheckJobStatus = 'processing' | 'completed' | 'error';

interface MemberCheckJob {
  id: string;
  status: MemberCheckJobStatus;
  result?: MemberCheckResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// フロントへ返すジョブの状態（内部情報は含めない）。
export interface MemberCheckJobView {
  id: string;
  status: MemberCheckJobStatus;
  result: MemberCheckResult | null;
  error: string | null;
}

// Salesforce へ同時に投げすぎないよう、少しずつ照合する。
const SALESFORCE_LOOKUP_CONCURRENCY = 6;
// 完了/失敗したジョブは一定時間で破棄（メモリ肥大を防ぐ）。
const JOB_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class MemberCheckService {
  private readonly logger = new Logger(MemberCheckService.name);
  // 単一インスタンス運用のため、ジョブはメモリ保持で十分（DBテーブル不要）。
  private readonly jobs = new Map<string, MemberCheckJob>();

  constructor(
    private readonly ocrService: OcrService,
    private readonly salesforceService: SalesforceService,
  ) {}

  /**
   * 非同期スキャンを開始し、ジョブIDを即返す。
   * OCR + Salesforce 照合は数十秒かかることがあるため、同期で待たせると
   * 途中でプロキシにタイムアウトされる。ここでは受付だけしてバックグラウンドで処理する。
   */
  startScan(files?: UploadedImage[]): { jobId: string; status: MemberCheckJobStatus } {
    const valid = (files ?? []).filter((f) => f && f.buffer && f.buffer.length > 0);
    if (valid.length === 0) {
      throw new BadRequestException('ファイルがアップロードされていません。');
    }

    this.purgeExpiredJobs();

    const id = randomUUID();
    const now = Date.now();
    this.jobs.set(id, { id, status: 'processing', createdAt: now, updatedAt: now });

    // awaitしない（バックグラウンド実行）。バッファはクロージャで保持される。
    void this.runJob(
      id,
      valid.map((f) => ({
        buffer: f.buffer,
        mimeType: f.mimetype,
        originalFileName: f.originalname,
      })),
    );

    return { jobId: id, status: 'processing' };
  }

  /** ジョブの状態・結果を返す（フロントがポーリングで叩く）。 */
  getJob(id: string): MemberCheckJobView {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException(
        '照合ジョブが見つかりません。時間が経過したか、サーバーが再起動した可能性があります。もう一度お試しください。',
      );
    }
    return {
      id: job.id,
      status: job.status,
      result: job.result ?? null,
      error: job.error ?? null,
    };
  }

  private async runJob(id: string, inputs: ScanInput[]): Promise<void> {
    try {
      const result = await this.scanRoster(inputs);
      const job = this.jobs.get(id);
      if (job) {
        job.status = 'completed';
        job.result = result;
        job.updatedAt = Date.now();
      }
    } catch (err) {
      this.logger.error(
        `member-check job ${id} failed`,
        err instanceof Error ? err.stack : String(err),
      );
      const job = this.jobs.get(id);
      if (job) {
        job.status = 'error';
        job.error =
          err instanceof Error ? err.message : '照合処理に失敗しました。時間を置いて再実行してください。';
        job.updatedAt = Date.now();
      }
    }
  }

  private purgeExpiredJobs(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.updatedAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }

  /** 実処理: 名簿ファイル（複数可）のOCR抽出 → 各人をSalesforceで照合。 */
  async scanRoster(inputs: ScanInput[]): Promise<MemberCheckResult> {
    // 複数ファイル（フォルダ含む）は全ファイルから人物を抽出し、まとめて照合する。
    const allPeople: ExtractedPerson[] = [];
    const confidences: number[] = [];
    for (const input of inputs) {
      const extraction = await this.ocrService.extractPeopleList({
        buffer: input.buffer,
        mimeType: input.mimeType,
        originalFileName: input.originalFileName,
      });
      allPeople.push(...extraction.people);
      confidences.push(extraction.confidence);
    }

    // Salesforce へ問い合わせる前に重複を整理する（無駄な照会を減らす意味もある）。
    const { people: uniquePeople, removedDuplicates } = this.removeExactDuplicates(allPeople);
    const warnNames = this.findDuplicateNames(uniquePeople);

    const matched = await this.matchPeopleWithSalesforce(uniquePeople);
    const people: MemberCheckPerson[] = matched.map((person) => ({
      ...person,
      duplicateWarning: warnNames.has(this.nameKey(person)),
    }));

    const matchedCount = people.filter((p) => p.salesforce.exists).length;
    const salesforceConfigured = people[0]?.salesforce.configured ?? this.salesforceService.isConfigured();

    return {
      totalPeople: people.length,
      matchedCount,
      confidence: confidences.length ? Math.min(...confidences) : 0,
      salesforceConfigured,
      removedDuplicates,
      duplicateWarningCount: people.filter((p) => p.duplicateWarning).length,
      people,
    };
  }

  private async matchPeopleWithSalesforce(
    extracted: ExtractedPerson[],
  ): Promise<Omit<MemberCheckPerson, 'duplicateWarning'>[]> {
    const people: Omit<MemberCheckPerson, 'duplicateWarning'>[] = new Array(extracted.length);

    for (let start = 0; start < extracted.length; start += SALESFORCE_LOOKUP_CONCURRENCY) {
      const chunk = extracted.slice(start, start + SALESFORCE_LOOKUP_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (person, offset) => {
          const salesforce = await this.lookupPersonSafely(person);
          return { index: start + offset, person: { ...person, salesforce } };
        }),
      );
      for (const result of results) {
        people[result.index] = result.person;
      }
    }

    return people;
  }

  /** 比較用の正規化（全角半角・空白のゆらぎを吸収する）。 */
  private norm(value: string | undefined): string {
    return (value ?? '').normalize('NFKC').replace(/[\s　]+/g, '').trim().toLowerCase();
  }

  /** 氏名だけの照合キー。fullName は表記ゆれが出るので姓名から組み立てる。 */
  private nameKey(person: ExtractedPerson): string {
    const name = `${this.norm(person.lastName)}${this.norm(person.firstName)}`;
    return name || this.norm(person.fullName);
  }

  /**
   * 全項目が同一のレコードだけを除去する。
   *
   * 同じページを二重に読んだ場合や、同じファイルを重ねてアップロードした場合が対象。
   * 氏名だけで消すと「別人の氏名を既出の人と誤読した」ケースで実在の人物が消えるため、
   * ここでは組・カナ・HDCP・備考まで一致するものに限定している。
   */
  private removeExactDuplicates(
    people: ExtractedPerson[],
  ): { people: ExtractedPerson[]; removedDuplicates: number } {
    const seen = new Set<string>();
    const unique: ExtractedPerson[] = [];

    for (const person of people) {
      const key = [
        this.nameKey(person),
        this.norm(person.kana),
        this.norm(person.group),
        this.norm(person.handicap),
        this.norm(person.note),
      ].join('|');

      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(person);
    }

    return { people: unique, removedDuplicates: people.length - unique.length };
  }

  /**
   * 氏名が重複している人を洗い出す（完全一致の除去後に残ったもの）。
   * OCR の誤読か実際の同姓同名かはシステムでは判断できないため、消さずに印を付ける。
   */
  private findDuplicateNames(people: ExtractedPerson[]): Set<string> {
    const counts = new Map<string, number>();
    for (const person of people) {
      const key = this.nameKey(person);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  }

  /**
   * 1人分の照合。1件でも例外を投げると Promise.all が失敗して名簿全体が落ちるため、
   * ここで握って「その人だけ未照合」にフォールバックする。
   */
  private async lookupPersonSafely(person: ExtractedPerson): Promise<SalesforcePersonSearchResult> {
    try {
      return await this.salesforceService.searchPeople({
        lastName: person.lastName,
        firstName: person.firstName,
        fullName: person.fullName,
        kana: person.kana,
      });
    } catch (err) {
      this.logger.warn(
        `Salesforce lookup failed for "${person.fullName || person.lastName}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      const displayQuery =
        [person.lastName, person.firstName].filter(Boolean).join(' ') || person.fullName || '';
      return {
        configured: this.salesforceService.isConfigured(),
        query: displayQuery,
        lastName: person.lastName ?? '',
        firstName: person.firstName ?? '',
        exists: false,
        matchCount: 0,
        matches: [],
      };
    }
  }
}
