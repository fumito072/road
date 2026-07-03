import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { AccountingFileResult, OcrService } from '../ocr/ocr.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export interface KeiriFileResult extends AccountingFileResult {
  suggestedName: string;
}

export interface KeiriScanResult {
  files: KeiriFileResult[];
  confidence: number;
}

@Injectable()
export class KeiriOcrService {
  constructor(private readonly ocrService: OcrService) {}

  async scan(files?: UploadedImage[]): Promise<KeiriScanResult> {
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

    const results: KeiriFileResult[] = extraction.fileResults.map((result) => ({
      ...result,
      suggestedName: this.buildFileName(result),
    }));

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
