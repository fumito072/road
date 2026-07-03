import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

export interface ExtractedPerson {
  group: string;
  lastName: string;
  firstName: string;
  fullName: string;
  kana: string;
  handicap: string;
  note: string;
}

export interface PeopleListResult {
  people: ExtractedPerson[];
  confidence: number;
  raw: Record<string, unknown>;
}

export interface AccountingFileResult {
  originalFileName: string;
  company: string;
  amount: string;
  date: string;
  documentType: string;
}

export interface AccountingExtractResult {
  fileResults: AccountingFileResult[];
  confidence: number;
  raw: Record<string, unknown>;
}

type GeminiGenerateResult = {
  model: string;
  raw: Record<string, unknown>;
};

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
    const mockMode = this.config.get<string>('OCR_MOCK_MODE') === 'true';
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    const fallbackModels = this.parseModelList(
      this.config.get<string>('GEMINI_FALLBACK_MODELS') ?? 'gemini-2.5-flash-lite',
    );

    if (mockMode) {
      this.logger.warn('OCR_MOCK_MODE is enabled; returning mock OCR result without calling Gemini');
      return this.buildMockResult(files);
    }

    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY is not configured');
    }

    this.logger.log(
      `OCR extract called for ${files.length} files, model: ${model}, fallbackModels: ${fallbackModels.join(', ') || 'none'}, apiKey present: ${!!apiKey}`,
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
          mime_type: this.resolveMimeType(file.mimeType, file.originalFileName),
          data: buffer.toString('base64'),
        },
      });
    }

    const { raw, model: usedModel } = await this.generateContentWithFallback(
      apiKey,
      [model, ...fallbackModels],
      parts,
    );

    if (usedModel !== model) {
      this.logger.warn(`Gemini OCR completed with fallback model: ${usedModel}`);
    }

    let text: string;
    let parsed: Record<string, unknown>;
    try {
      text = this.extractText(raw);
      parsed = this.parseStructuredJson(text);
    } catch (err) {
      this.logger.error('Failed to parse Gemini OCR response', err as Error);
      throw new InternalServerErrorException(
        'OCR応答の解析に失敗しました。ファイルを確認して再実行してください。',
      );
    }
    const normalized = this.normalizeStructuredResult(parsed, files);

    return {
      raw,
      structured: normalized,
      confidence: Number(normalized.confidence ?? 0),
    };
  }

  /**
   * 紙の名簿画像（ゴルフコンペ参加者表など）から人物の一覧を抽出する。
   * 文書命名フローとは別物で、1枚の画像から複数人を取り出すのが目的。
   */
  async extractPeopleList(file: {
    storagePath?: string;
    buffer?: Buffer;
    mimeType: string;
    originalFileName: string;
  }): Promise<PeopleListResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    const fallbackModels = this.parseModelList(
      this.config.get<string>('GEMINI_FALLBACK_MODELS') ?? 'gemini-2.5-flash-lite',
    );

    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY is not configured');
    }

    if (!file.buffer && !file.storagePath) {
      throw new BadRequestException('No image provided for people-list extraction');
    }

    const buffer = file.buffer ?? (await this.loadFileBuffer(file.storagePath as string));
    const parts: Array<Record<string, unknown>> = [
      { text: this.buildPeopleListPrompt() },
      {
        inline_data: {
          mime_type: this.resolveMimeType(file.mimeType, file.originalFileName),
          data: buffer.toString('base64'),
        },
      },
    ];

    const { raw } = await this.generateContentWithFallback(apiKey, [model, ...fallbackModels], parts);

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseStructuredJson(this.extractText(raw));
    } catch (err) {
      this.logger.error('Failed to parse Gemini people-list response', err as Error);
      throw new InternalServerErrorException(
        '名簿の読み取り結果を解析できませんでした。画像を確認して再実行してください。',
      );
    }

    return {
      people: this.normalizePeople(parsed),
      confidence: this.asNumber(parsed.confidence) ?? 0.6,
      raw,
    };
  }

  private buildPeopleListPrompt(): string {
    return [
      'あなたは日本語の名簿・参加者リストを読み取るOCRシステムです。',
      '画像は紙の名簿（例：ゴルフコンペの参加者表）で、複数の人物が表形式で並んでいます。1行に複数名が含まれることがあります。',
      '各人物について以下を抽出してください：',
      '- group: 組番号・グループ番号（例: 805）。無ければ空文字。',
      '- lastName: 氏名の「姓」。',
      '- firstName: 氏名の「名」。',
      '- fullName: 「姓 名」（姓と名を半角スペース1つで連結）。',
      '- kana: 氏名のフリガナ（カタカナ）。多くは氏名の上に小さく書かれています。無ければ空文字。',
      '- handicap: HDCP（ハンディキャップ）の数値。無ければ空文字。',
      '- note: 会社名・「ゲスト」・資格表記など、その人に付随するメモ。無ければ空文字。',
      '重要: 氏名の漢字は推測で変えず、見えたとおり正確に書き写してください。姓と名の間の区切り（スペース）で姓・名を分けてください。',
      '重要: lastName / firstName / fullName / kana には人名（漢字・かな）だけを入れてください。名簿上の装飾記号（○ ● ◎ ※(米印) ☆ △ □ など）や参加区分の番号（「※2」など）は氏名に絶対に含めないでください。それらの印は note に入れてください（任意）。',
      '読み取れない文字があっても最も可能性の高い字を1つ選び、自信が低い場合は confidence を下げてください。',
      'ヘッダー行（「組」「氏名」「HDCP」等）・注意書き・表彰ルールなどは人物として出力しないでください。',
      '出力は有効なJSONのみ。スキーマ:',
      '{"people":[{"group":"","lastName":"","firstName":"","fullName":"","kana":"","handicap":"","note":""}],"confidence":0.0}',
    ].join('\n');
  }

  private normalizePeople(parsed: Record<string, unknown>): ExtractedPerson[] {
    const rawList = Array.isArray(parsed.people) ? parsed.people : [];
    const people: ExtractedPerson[] = [];

    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      let lastName = this.sanitizePersonName(this.asString(record.lastName) ?? '');
      let firstName = this.sanitizePersonName(this.asString(record.firstName) ?? '');
      let fullName = this.sanitizePersonName(this.asString(record.fullName) ?? '');

      // 姓・名が空で fullName だけある場合は空白で分割する。
      if (!lastName && !firstName && fullName) {
        const parts = fullName.split(/[\s　]+/).filter(Boolean);
        lastName = parts[0] ?? '';
        firstName = parts.slice(1).join('');
      }

      // クリーニング後の姓・名から fullName を組み直し、記号の混入を防ぐ。
      const rebuilt = [lastName, firstName].filter(Boolean).join(' ');
      if (rebuilt) fullName = rebuilt;

      if (!lastName && !firstName && !fullName) continue;

      people.push({
        group: this.asString(record.group) ?? '',
        lastName,
        firstName,
        fullName,
        kana: this.sanitizePersonName(this.asString(record.kana) ?? ''),
        handicap: this.asString(record.handicap) ?? '',
        note: this.asString(record.note) ?? '',
      });
    }

    return people;
  }

  /**
   * 氏名から装飾記号(○ ● ◎ ※(米印) ☆ △ □ など)・番号・括弧を除去し、人名だけを残す。
   * 注意: 「米内山」等の漢字「米」(U+7C73) は除去対象ではない。除去するのは米印「※」(U+203B) など。
   */
  private sanitizePersonName(value: string): string {
    if (!value) return '';
    return value
      .replace(/[○◯〇◎●⭕⚪⚫＊*※☆★◇◆□■△▲▽▼▶▷◀◁→←↑↓…]/g, ' ')
      .replace(/[0-9０-９]/g, ' ')
      .replace(/[()（）\[\]{}【】「」『』〔〕＜＞<>]/g, ' ')
      .replace(/[\s　]+/g, ' ')
      .trim();
  }

  /**
   * 経理用: 領収書・請求書を読み取り、会社名・金額・取引日・書類種別を抽出する。
   * ファイル名は「購入日_会社名_金額」を想定（最終的な命名は呼び出し側で組み立てる）。
   */
  async extractAccountingDocuments(
    files: Array<{
      storagePath?: string;
      buffer?: Buffer;
      mimeType: string;
      originalFileName: string;
    }>,
  ): Promise<AccountingExtractResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    const fallbackModels = this.parseModelList(
      this.config.get<string>('GEMINI_FALLBACK_MODELS') ?? 'gemini-2.5-flash-lite',
    );

    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY is not configured');
    }

    const parts: Array<Record<string, unknown>> = [{ text: this.buildAccountingPrompt(files) }];
    for (const file of files) {
      if (!file.buffer && !file.storagePath) {
        throw new BadRequestException('No image provided for accounting extraction');
      }
      const buffer = file.buffer ?? (await this.loadFileBuffer(file.storagePath as string));
      parts.push({ text: `File name: ${file.originalFileName}` });
      parts.push({
        inline_data: {
          mime_type: this.resolveMimeType(file.mimeType, file.originalFileName),
          data: buffer.toString('base64'),
        },
      });
    }

    const { raw } = await this.generateContentWithFallback(apiKey, [model, ...fallbackModels], parts);

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseStructuredJson(this.extractText(raw));
    } catch (err) {
      this.logger.error('Failed to parse Gemini accounting response', err as Error);
      throw new InternalServerErrorException(
        '領収書・請求書の読み取り結果を解析できませんでした。ファイルを確認して再実行してください。',
      );
    }

    const rawList = Array.isArray(parsed.fileResults) ? parsed.fileResults : [];
    const fileResults: AccountingFileResult[] = files.map((file, index) => {
      const candidate = (rawList[index] ?? {}) as Record<string, unknown>;
      return {
        originalFileName: file.originalFileName,
        company: this.sanitizeCompanyName(this.asString(candidate.company) ?? ''),
        amount: this.normalizeAmount(candidate.amount),
        date: this.normalizeDocumentDate(candidate.date),
        documentType: this.asString(candidate.documentType) ?? '',
      };
    });

    return {
      fileResults,
      confidence: this.asNumber(parsed.confidence) ?? 0.6,
      raw,
    };
  }

  private buildAccountingPrompt(
    files: Array<{ originalFileName: string }>,
  ): string {
    const fileNames = files.map((file, index) => `${index + 1}. ${file.originalFileName}`).join('\n');
    return [
      'あなたは経費精算のために領収書・請求書を読み取るOCRシステムです。',
      'アップロードされた各ファイル（1ファイル＝1書類）について、以下を抽出してください。',
      '- company: 発行元の会社名・店舗名（領収書なら発行した店舗/会社、請求書なら請求元）。「株式会社」などの会社種別は付いていればそのまま含める。',
      '- amount: 税込の合計金額。数字のみ（カンマ・¥・円・小数は付けない）。例: 「¥3,300」→「3300」。複数あれば合計（お支払い金額）を採用。',
      '- date: 取引日（領収書は領収日/購入日、請求書は発行日）を YYYYMMDD で。令和/平成/昭和は西暦に変換。読み取れなければ空文字。',
      '- documentType: 「領収書」または「請求書」。判別できなければ「その他」。',
      'fileResults は入力ファイルと同じ件数・同じ順番で返してください。',
      '出力は有効なJSONのみ。スキーマ:',
      '{"fileResults":[{"originalFileName":"","company":"","amount":"","date":"","documentType":""}],"confidence":0.0}',
      'Files:',
      fileNames,
    ].join('\n');
  }

  private normalizeAmount(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.round(value));
    }
    if (typeof value !== 'string') return '';
    return value.replace(/[^0-9]/g, '');
  }

  // 会社名から命名に使えない文字を除去（半角スペース化）。社名内のスペースは保持。
  private sanitizeCompanyName(value: string): string {
    return value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildMockResult(files: ExtractFileInput[]): OcrResult {
    const parsed = {
      customerName: '確認用顧客',
      customerKana: '',
      customerNameCandidates: ['確認用顧客'],
      customerKanaCandidates: [],
      contractNumber: '確認要契約ID',
      applicationNumber: '',
      sharepointFolderPath: '',
      confidence: 0.5,
      summary: 'OCR_MOCK_MODE による仮のOCR結果です。実運用前に必ず内容を確認してください。',
      fileResults: files.map((file) => ({
        originalFileName: file.originalFileName,
        documentType: this.inferDocumentType(file.originalFileName),
        documentDate: '',
        confidence: 0.5,
        reason: 'OCR_MOCK_MODE によるファイル名ベースの仮分類です。',
      })),
    };
    const structured = this.normalizeStructuredResult(parsed, files);

    return {
      raw: {
        mock: true,
        model: 'OCR_MOCK_MODE',
        fileCount: files.length,
      },
      structured,
      confidence: Number(structured.confidence ?? 0),
    };
  }

  private async generateContentWithFallback(
    apiKey: string,
    models: string[],
    parts: Array<Record<string, unknown>>,
  ): Promise<GeminiGenerateResult> {
    const uniqueModels = [...new Set(models.map((item) => item.trim()).filter(Boolean))];
    const attempts = this.parsePositiveInt(this.config.get<string>('GEMINI_RETRY_ATTEMPTS'), 3);
    let lastStatus = 0;
    let lastRaw: Record<string, unknown> = {};

    for (const model of uniqueModels) {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
        const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (response.ok) {
          return { model, raw };
        }

        lastStatus = response.status;
        lastRaw = raw;
        this.logger.error(
          `Gemini OCR request failed (model=${model}, attempt=${attempt}/${attempts}, status=${response.status}): ${JSON.stringify(raw)}`,
        );

        if (response.status === 429) {
          this.throwGeminiQuotaError(response, raw);
        }

        if (!this.isRetryableGeminiStatus(response.status)) {
          throw new InternalServerErrorException(
            'OCR処理でエラーが発生しました。しばらく待ってから再実行してください。',
          );
        }

        if (attempt < attempts) {
          await this.sleep(this.retryDelayMs(attempt));
        }
      }
    }

    this.logger.error(
      `Gemini OCR request exhausted retryable attempts (lastStatus=${lastStatus}): ${JSON.stringify(lastRaw)}`,
    );
    throw new HttpException(
      {
        message:
          'Gemini API が混雑しています。少し時間を置いてから再実行してください。',
        error: 'Service Unavailable',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private throwGeminiQuotaError(response: Response, raw: Record<string, unknown>): never {
    const retryAfter = response.headers.get('retry-after') ?? this.extractRetryDelaySeconds(raw);
    throw new HttpException(
      {
        message: retryAfter
          ? `Gemini API の利用上限に達しています。${retryAfter}秒ほど時間を置くか、Gemini API キーの利用枠を確認してから再実行してください。`
          : 'Gemini API の利用上限に達しています。少し時間を置くか、Gemini API キーの利用枠を確認してから再実行してください。',
        error: 'Too Many Requests',
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private isRetryableGeminiStatus(status: number) {
    return status === 500 || status === 502 || status === 503 || status === 504;
  }

  private retryDelayMs(attempt: number) {
    return Math.min(1000 * 2 ** (attempt - 1), 4000);
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseModelList(value: string) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return fallback;
    }
    return Math.min(parsed, 5);
  }

  private extractRetryDelaySeconds(raw: Record<string, unknown>) {
    const details = raw.error && typeof raw.error === 'object'
      ? (raw.error as Record<string, unknown>).details
      : undefined;
    if (!Array.isArray(details)) return null;

    for (const detail of details) {
      if (!detail || typeof detail !== 'object') continue;
      const retryDelay = (detail as Record<string, unknown>).retryDelay;
      if (typeof retryDelay === 'string') {
        return retryDelay.replace(/s$/, '');
      }
    }
    return null;
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
      'IMPORTANT: customerName must NOT include any company designator (株式会社, 有限会社, 合同会社, 医療法人, （株）, ㈱, Inc., Co., Ltd., LLC, Corp., etc.). Strip them and return only the core customer name.',
      'Also provide customerNameCandidates and customerKanaCandidates as short arrays ordered by confidence. The candidates must also omit the company designators.',
      'For each file, extract the primary date printed on the document (契約日, 申込日, 発行日, 請求日, 領収日, etc. — whichever best represents the document) and return it as documentDate in YYYYMMDD format. If the document shows 令和/平成/昭和, convert to the Gregorian year. If no date is present, return an empty string.',
      this.buildNamingRulesSection(context?.namingRules),
      'Do not finalize the SharePoint destination. sharepointFolderPath may be left empty if uncertain.',
      'JSON schema:',
      '{"customerName":"","customerKana":"","customerNameCandidates":[""],"customerKanaCandidates":[""],"contractNumber":"","applicationNumber":"","sharepointFolderPath":"","confidence":0.0,"summary":"","fileResults":[{"originalFileName":"","documentType":"","documentDate":"","outputFileName":"","confidence":0.0,"reason":""}]}',
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
      'File naming rule (STRICT): outputFileName MUST follow the pattern "{date}_{customerName}_{documentType}.pdf" (the three segments are separated by underscores).',
      '{date} is the documentDate extracted from that file in YYYYMMDD format. If documentDate is empty, leave the outputFileName prefix as an empty string (the server will fill in today). Replace sanitization characters (\\ / : * ? " < > |) with spaces. Keep spaces inside customerName as-is (do NOT replace spaces with underscores).',
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
  ) {
    const rawCustomerName = this.asString(parsed.customerName) ?? '確認要クライアント';
    const customerName = this.stripCompanyDesignators(rawCustomerName);
    const customerKana = this.asString(parsed.customerKana) ?? '';
    const contractNumber = this.asString(parsed.contractNumber) ?? '確認要契約ID';
    const applicationNumber = this.asString(parsed.applicationNumber) ?? '';
    const customerNameCandidates = this.normalizeStringArray(parsed.customerNameCandidates, customerName)
      .map((name) => this.stripCompanyDesignators(name))
      .filter((name, index, arr) => name && arr.indexOf(name) === index);
    const customerKanaCandidates = this.normalizeStringArray(parsed.customerKanaCandidates, customerKana);
    const rawFileResults = Array.isArray(parsed.fileResults) ? parsed.fileResults : [];
    const fileResults = files.map((file, index) => {
      const candidate = (rawFileResults[index] ?? {}) as Record<string, unknown>;
      const documentType = this.asString(candidate.documentType) ?? '書類';
      const documentDate = this.normalizeDocumentDate(candidate.documentDate);
      const outputFileName = this.buildStandardFileName(customerName, documentType, documentDate);
      const confidence = this.asNumber(candidate.confidence) ?? 0.6;

      return {
        originalFileName: file.originalFileName,
        documentType,
        documentDate,
        outputFileName,
        confidence,
        reason: this.asString(candidate.reason) ?? '',
      };
    });

    const confidence =
      this.asNumber(parsed.confidence) ??
      fileResults.reduce((total, item) => total + item.confidence, 0) / Math.max(fileResults.length, 1);

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

  private stripCompanyDesignators(value: string) {
    if (!value) return value;
    const trimmed = value
      .replace(
        /株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|社会福祉法人|一般社団法人|一般財団法人|（株）|\(株\)|㈱|Inc\.?|Co\.?Ltd\.?|LLC|Ltd\.?|Corp\.?/gi,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
    return trimmed || value.trim();
  }

  private buildStandardFileName(customerName: string, documentType: string, documentDate: string) {
    const date = documentDate || this.todayYyyymmdd();
    // 命名規則: 日付_社名_書類種別.pdf（区切りは _、社名内のスペースはそのまま保持）
    const safe = [date, customerName, documentType]
      .map((segment) => segment.trim().replace(/[\\/:*?"<>|]+/g, ' '))
      .filter(Boolean)
      .join('_');

    return `${safe}.pdf`;
  }

  private todayYyyymmdd() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  private normalizeDocumentDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const digits = trimmed.replace(/[^0-9]/g, '');
    if (digits.length === 8) return digits;
    return '';
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

    return readFile(storagePath);
  }

  private resolveMimeType(mimeType: string, fileName: string) {
    const trusted = mimeType?.trim();
    if (trusted && trusted !== 'application/octet-stream') {
      return trusted;
    }
    const inferred = this.inferMimeType(fileName);
    return inferred === 'application/octet-stream' ? 'application/pdf' : inferred;
  }

  private inferMimeType(fileName: string) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
    return 'application/octet-stream';
  }

  private inferDocumentType(fileName: string) {
    if (fileName.includes('申込')) return '申込書';
    if (fileName.includes('契約')) return '契約書';
    if (fileName.includes('重要事項')) return '重要事項';
    if (fileName.includes('請求')) return '請求書';
    if (fileName.includes('領収')) return '領収書';
    if (fileName.includes('チェック')) return 'チェックシート';
    if (fileName.includes('明細')) return '明細';
    return 'その他';
  }
}
