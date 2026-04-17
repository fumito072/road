import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { readFile } from 'node:fs/promises';

type ExtractFileInput = {
  storagePath: string;
  mimeType: string;
  originalFileName: string;
};

type OcrContext = {
  tabName: string;
  baseSharepointFolderPath?: string | null;
  namingRules?: Array<{
    documentType: string;
    pattern: string;
    description?: string | null;
  }>;
};

export interface OcrResult {
  raw: Record<string, unknown>;
  structured: Record<string, unknown>;
  confidence: number;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Extract structured data from files using Gemini API.
   * TODO: Implement actual Gemini API call.
   */
  async extract(
    files: ExtractFileInput[],
    promptTemplate?: string | null,
    context?: OcrContext,
  ): Promise<OcrResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash';

    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY is not configured');
    }

    this.logger.log(
      `OCR extract called for ${files.length} files, apiKey present: ${!!apiKey}`,
    );

    const parts: Array<Record<string, unknown>> = [
      {
        text: this.buildPrompt(files, promptTemplate, context),
      },
    ];

    for (const file of files) {
      const buffer = await this.loadFileBuffer(file.storagePath);
      parts.push({
        text: `File name: ${file.originalFileName}`,
      });
      parts.push({
        inline_data: {
          mime_type: file.mimeType || this.inferMimeType(file.originalFileName),
          data: buffer.toString('base64'),
        },
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      },
    );

    const raw = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Gemini OCR request failed: ${JSON.stringify(raw)}`,
      );
    }

    const text = this.extractText(raw);
    const parsed = this.parseStructuredJson(text);
    const normalized = this.normalizeStructuredResult(parsed, files, context);

    return {
      raw,
      structured: normalized,
      confidence: Number(normalized.confidence ?? 0),
    };
  }

  private buildPrompt(
    files: ExtractFileInput[],
    promptTemplate?: string | null,
    context?: OcrContext,
  ) {
    const fileNames = files.map((file, index) => `${index + 1}. ${file.originalFileName}`).join('\n');

    return [
      'You are an OCR and business document classification system.',
      'Return only valid JSON.',
      `Business tab: ${context?.tabName ?? 'unknown'}`,
      context?.baseSharepointFolderPath
        ? `Base SharePoint folder path: ${context.baseSharepointFolderPath}`
        : 'Base SharePoint folder path: use the business tab name as the root folder.',
      'The uploaded files belong to a single client.',
      'Determine customerName, customerKana, contractNumber, applicationNumber, and classify each file into a documentType.',
      'Also provide customerNameCandidates and customerKanaCandidates as short arrays ordered by confidence.',
      this.buildNamingRulesSection(context?.namingRules),
      'Do not finalize the SharePoint destination. sharepointFolderPath may be left empty if uncertain.',
      'JSON schema:',
      '{"customerName":"","customerKana":"","customerNameCandidates":[""],"customerKanaCandidates":[""],"contractNumber":"","applicationNumber":"","sharepointFolderPath":"","confidence":0.0,"summary":"","fileResults":[{"originalFileName":"","documentType":"","outputFileName":"","confidence":0.0,"reason":""}]}',
      'Files:',
      fileNames,
      promptTemplate?.trim() ? `Additional instructions:\n${promptTemplate.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildNamingRulesSection(
    rules?: Array<{ documentType: string; pattern: string; description?: string | null }>,
  ): string {
    const baseRule = [
      'File naming rule (STRICT): outputFileName MUST follow the pattern "{date}_{customerName}_{documentType}.pdf".',
      '{date} is today in YYYYMMDD format. Replace sanitization characters (\\ / : * ? " < > | whitespace) with underscores.',
      'Do not include contractNumber, index, or the original extension. Always use the .pdf suffix.',
    ];

    if (!rules || rules.length === 0) {
      return [
        ...baseRule,
        'Classify each file into documentType based on its content (e.g. 契約書, 請求書, 申込書, 領収書, その他).',
      ].join('\n');
    }

    const ruleLines = rules.map((rule, index) => {
      const desc = rule.description ? ` (${rule.description})` : '';
      return `  ${index + 1}. documentType="${rule.documentType}"${desc}`;
    });

    return [
      ...baseRule,
      'Allowed documentType values (match the file content to the most appropriate one):',
      ...ruleLines,
      'If none match, use documentType="その他".',
    ].join('\n');
  }

  private extractText(raw: Record<string, unknown>) {
    const candidates = raw.candidates as Array<Record<string, unknown>> | undefined;
    const first = candidates?.[0];
    const content = first?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const text = parts
      ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();

    if (!text) {
      throw new InternalServerErrorException('Gemini OCR response did not contain any text payload');
    }

    return text;
  }

  private parseStructuredJson(text: string): Record<string, unknown> {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const jsonText = fenced?.[1] ?? text;

    try {
      return JSON.parse(jsonText);
    } catch {
      throw new InternalServerErrorException(`Failed to parse Gemini OCR JSON: ${text}`);
    }
  }

  private normalizeStructuredResult(
    parsed: Record<string, unknown>,
    files: ExtractFileInput[],
    context?: OcrContext,
  ) {
    const customerName = this.asString(parsed.customerName) ?? '確認要クライアント';
    const customerKana = this.asString(parsed.customerKana) ?? '';
    const contractNumber = this.asString(parsed.contractNumber) ?? '確認要契約ID';
    const applicationNumber = this.asString(parsed.applicationNumber) ?? '';
    const customerNameCandidates = this.normalizeStringArray(parsed.customerNameCandidates, customerName);
    const customerKanaCandidates = this.normalizeStringArray(parsed.customerKanaCandidates, customerKana);
    const rawFileResults = Array.isArray(parsed.fileResults) ? parsed.fileResults : [];
    const fileResults = files.map((file, index) => {
      const candidate = (rawFileResults[index] ?? {}) as Record<string, unknown>;
      const documentType = this.asString(candidate.documentType) ?? '書類';
      const outputFileName = this.buildStandardFileName(customerName, documentType);
      const confidence = this.asNumber(candidate.confidence) ?? 0.6;

      return {
        originalFileName: file.originalFileName,
        documentType,
        outputFileName,
        confidence,
        reason: this.asString(candidate.reason) ?? '',
      };
    });

    const confidence =
      this.asNumber(parsed.confidence) ??
      fileResults.reduce((total, item) => total + item.confidence, 0) / Math.max(fileResults.length, 1);

    const baseFolder = context?.baseSharepointFolderPath?.trim() || context?.tabName || 'ocr-output';
    const sharepointFolderPath = '';

    return {
      customerName,
      customerKana,
      customerNameCandidates,
      customerKanaCandidates,
      contractNumber,
      applicationNumber,
      sharepointFolderPath,
      summary: this.asString(parsed.summary) ?? '',
      confidence,
      fileResults,
    };
  }

  private buildStandardFileName(customerName: string, documentType: string) {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const safe = [date, customerName, documentType]
      .map((segment) => segment.replace(/[\\/:*?"<>|\s]+/g, '_'))
      .filter(Boolean)
      .join('_');

    return `${safe}.pdf`;
  }

  private asString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private asNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private normalizeStringArray(value: unknown, fallback?: string) {
    const items = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [];

    if (fallback?.trim()) {
      items.unshift(fallback.trim());
    }

    return [...new Set(items)];
  }

  private async loadFileBuffer(storagePath: string): Promise<Buffer> {
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      const response = await fetch(storagePath);
      if (!response.ok) {
        throw new InternalServerErrorException(`Failed to download file from URL: ${storagePath}`);
      }

      return Buffer.from(await response.arrayBuffer());
    }

    if (storagePath.startsWith('gs://')) {
      const normalized = storagePath.replace('gs://', '');
      const slashIndex = normalized.indexOf('/');
      const bucketName = normalized.slice(0, slashIndex);
      const filePath = normalized.slice(slashIndex + 1);
      const [buffer] = await admin.storage().bucket(bucketName).file(filePath).download();
      return buffer;
    }

    return readFile(storagePath);
  }

  private inferMimeType(fileName: string) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
    return 'application/octet-stream';
  }
}
