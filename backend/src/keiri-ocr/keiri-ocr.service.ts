import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { AccountingFileResult, OcrService } from '../ocr/ocr.service';
import { NamingMemoryService } from '../naming-memory/naming-memory.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export interface KeiriFileResult extends AccountingFileResult {
  suggestedName: string;
  /**
   * AI が読んだ生の値。company / documentType は辞書適用後の値になるため、
   * 学習のキーには必ずこちらを使う（適用後の値をキーにすると元の誤読が直らない）。
   */
  ocrCompany: string;
  ocrDocumentType: string;
  /** 過去の修正内容を自動適用したか。UI のバッジ表示に使う。 */
  appliedFromMemory: boolean;
  documentTypeAppliedFromMemory: boolean;
}

export interface KeiriScanResult {
  files: KeiriFileResult[];
  confidence: number;
}

@Injectable()
export class KeiriOcrService {
  constructor(
    private readonly ocrService: OcrService,
    private readonly namingMemoryService: NamingMemoryService,
  ) {}

  async scan(files?: UploadedImage[], tabId?: string): Promise<KeiriScanResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('ファイルがアップロードされていません。');
    }

    const extraction = await this.ocrService.extractAccountingDocuments(
      files.map((file) => ({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalFileName: file.originalname,
      })),
    );

    // 過去にユーザーが直した表記があれば、この時点で置き換えてしまう。
    const [appliedCompanies, appliedDocumentTypes] = await Promise.all([
      this.namingMemoryService.applyToValues(
        tabId ?? '',
        'company',
        extraction.fileResults.map((result) => result.company),
      ),
      this.namingMemoryService.applyToValues(
        tabId ?? '',
        'documentType',
        extraction.fileResults.map((result) => result.documentType),
      ),
    ]);

    const results: KeiriFileResult[] = extraction.fileResults.map((result, index) => {
      const company = appliedCompanies[index] ?? { value: result.company, applied: false };
      const documentType = appliedDocumentTypes[index] ?? {
        value: result.documentType,
        applied: false,
      };
      const resolved: AccountingFileResult = {
        ...result,
        company: company.value,
        documentType: documentType.value,
      };

      return {
        ...resolved,
        ocrCompany: result.company,
        ocrDocumentType: result.documentType,
        appliedFromMemory: company.applied,
        documentTypeAppliedFromMemory: documentType.applied,
        suggestedName: this.buildFileName(resolved),
      };
    });

    return { files: results, confidence: extraction.confidence };
  }

  /** 命名規則: 購入日_会社名_金額（拡張子は元ファイルのものを維持）。空の項目はスキップ。 */
  private buildFileName(result: AccountingFileResult): string {
    const ext = extname(result.originalFileName) || '.pdf';
    const base = [result.date, result.company, result.amount]
      .map((segment) => (segment ?? '').trim().replace(/[\\/:*?"<>|]+/g, ' ').trim())
      .filter(Boolean)
      .join('_');
    return base ? `${base}${ext}` : result.originalFileName;
  }
}
