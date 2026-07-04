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
}

export interface MemberCheckResult {
  totalPeople: number;
  matchedCount: number;
  confidence: number;
  salesforceConfigured: boolean;
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
  startScan(file?: UploadedImage): { jobId: string; status: MemberCheckJobStatus } {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('画像ファイルがアップロードされていません。');
    }

    this.purgeExpiredJobs();

    const id = randomUUID();
    const now = Date.now();
    this.jobs.set(id, { id, status: 'processing', createdAt: now, updatedAt: now });

    // awaitしない（バックグラウンド実行）。バッファはクロージャで保持される。
    void this.runJob(id, {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
    });

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

  private async runJob(id: string, input: ScanInput): Promise<void> {
    try {
      const result = await this.scanRoster(input);
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

  /** 実処理: 名簿画像のOCR抽出 → 各人をSalesforceで照合。 */
  async scanRoster(input: ScanInput): Promise<MemberCheckResult> {
    const extraction = await this.ocrService.extractPeopleList({
      buffer: input.buffer,
      mimeType: input.mimeType,
      originalFileName: input.originalFileName,
    });

    const people = await this.matchPeopleWithSalesforce(extraction.people);

    const matchedCount = people.filter((p) => p.salesforce.exists).length;
    const salesforceConfigured = people[0]?.salesforce.configured ?? this.salesforceService.isConfigured();

    return {
      totalPeople: people.length,
      matchedCount,
      confidence: extraction.confidence,
      salesforceConfigured,
      people,
    };
  }

  private async matchPeopleWithSalesforce(
    extracted: ExtractedPerson[],
  ): Promise<MemberCheckPerson[]> {
    const people: MemberCheckPerson[] = new Array(extracted.length);

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
