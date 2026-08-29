import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { BillingFileResult, OcrService } from '../ocr/ocr.service';
import { NamingMemoryService } from '../naming-memory/naming-memory.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export interface BillingScanFileResult extends BillingFileResult {
  suggestedName: string;
  /**
   * AI が読んだ生の値。各項目は辞書適用後の値になるため、
   * 学習のキーには必ずこちらを使う（適用後の値をキーにすると元の誤読が直らない）。
   */
  ocrCustomerName: string;
  ocrStatementType: string;
  ocrCarrier: string;
  /** 過去の修正内容を自動適用したか。UI のバッジ表示に使う。 */
  appliedFromMemory: boolean;
  statementTypeAppliedFromMemory: boolean;
  carrierAppliedFromMemory: boolean;
}

export interface BillingScanResult {
  files: BillingScanFileResult[];
  confidence: number;
}

@Injectable()
export class BillingOcrService {
  constructor(
    private readonly ocrService: OcrService,
    private readonly namingMemoryService: NamingMemoryService,
  ) {}

  async scan(files?: UploadedImage[], tabId?: string): Promise<BillingScanResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('ファイルがアップロードされていません。');
    }

    const extraction = await this.ocrService.extractBillingStatements(
      files.map((file) => ({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalFileName: file.originalname,
      })),
    );

    // 過去にユーザーが直した表記があれば、この時点で置き換えてしまう。
    const [appliedCustomers, appliedStatementTypes, appliedCarriers] = await Promise.all([
      this.namingMemoryService.applyToValues(
        tabId ?? '',
        'company',
        extraction.fileResults.map((result) => result.customerName),
      ),
      this.namingMemoryService.applyToValues(
        tabId ?? '',
        'documentType',
        extraction.fileResults.map((result) => result.statementType),
      ),
      this.namingMemoryService.applyToValues(
        tabId ?? '',
        'carrier',
        extraction.fileResults.map((result) => result.carrier),
      ),
    ]);

    const results: BillingScanFileResult[] = extraction.fileResults.map((result, index) => {
      const customer = appliedCustomers[index] ?? { value: result.customerName, applied: false };
      const statementType = appliedStatementTypes[index] ?? {
        value: result.statementType,
        applied: false,
      };
      const carrier = appliedCarriers[index] ?? { value: result.carrier, applied: false };

      const resolved: BillingFileResult = {
        ...result,
        customerName: customer.value,
        statementType: statementType.value,
        carrier: carrier.value,
      };

      return {
        ...resolved,
        ocrCustomerName: result.customerName,
        ocrStatementType: result.statementType,
        ocrCarrier: result.carrier,
        appliedFromMemory: customer.applied,
        statementTypeAppliedFromMemory: statementType.applied,
        carrierAppliedFromMemory: carrier.applied,
        suggestedName: this.buildFileName(resolved),
      };
    });

    return { files: results, confidence: extraction.confidence };
  }

  /**
   * 命名規則: 日付_顧客名_明細の種類（キャリア名）。拡張子は元ファイルのものを維持。
   * 例: 20260826_ロード_請求明細（東京電力）.pdf
   * キャリア名が読み取れなかった場合は括弧ごと省く。
   */
  private buildFileName(result: BillingFileResult): string {
    const ext = extname(result.originalFileName) || '.pdf';
    const clean = (value: string) =>
      (value ?? '').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

    const carrier = clean(result.carrier);
    const statement = clean(result.statementType);
    const statementWithCarrier = carrier ? `${statement}（${carrier}）` : statement;

    const base = [clean(result.date), clean(result.customerName), statementWithCarrier]
      .filter(Boolean)
      .join('_');

    return base ? `${base}${ext}` : result.originalFileName;
  }
}
