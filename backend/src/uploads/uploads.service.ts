import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ocr/ocr.service';
import { SharepointFolderEntry, SharepointService } from '../sharepoint/sharepoint.service';
import { NamingRulesService } from '../naming-rules/naming-rules.service';
import { CreateUploadDto, ConfirmUploadDto, IntakeUploadDto, ResolveUploadDto } from './uploads.dto';
import { UploadStatus, Prisma } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as admin from 'firebase-admin';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type StructuredFileResult = {
  originalFileName?: string;
  outputFileName?: string;
  documentType?: string;
  documentDate?: string;
  confidence?: number;
  reason?: string;
};

type DestinationCandidate = {
  absolutePath: string;
  exists: boolean;
  reason: string;
};

type DestinationResolution = {
  customerName: string;
  customerKana?: string;
  customerFolderPath?: string;
  customerFolderExists: boolean;
  businessTabFound: boolean;
  destinationCandidates: DestinationCandidate[];
  newFolderPlan: string[];
  warnings: string[];
};

type CustomerFolderMatch = {
  folder: SharepointFolderEntry;
  score: number;
  isVariantExactMatch: boolean;
};

type UploadStructuredResult = {
  contractNumber?: string;
  customerName?: string;
  customerKana?: string;
  applicationNumber?: string;
  sharepointFolderPath?: string;
  customerNameCandidates?: string[];
  customerKanaCandidates?: string[];
  destinationResolution?: DestinationResolution;
  fileResults?: StructuredFileResult[];
  [key: string]: unknown;
};

const BUSINESS_FOLDER_ALIASES: Record<string, string[]> = {
  'モバイル': ['モバイル'],
  '電力': ['電力'],
  'コラボ': ['コラボ'],
  'リース・現金': ['リース・現金', 'リース', '現金', 'ＣＩＳ'],
  '酒井（領収書）': ['酒井（領収証）', '酒井（領収書）'],
};

const MAX_DESTINATION_CANDIDATES = 60;
const MAX_BFS_DEPTH = 2;
const FOLDER_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedFolderList = {
  folders: SharepointFolderEntry[];
  cachedAt: number;
};

@Injectable()
export class UploadsService {
  private readonly folderListCache = new Map<string, CachedFolderList>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly sharepointService: SharepointService,
    private readonly namingRulesService: NamingRulesService,
  ) {}

  findAllByTab(tabId: string, userId: string) {
    return this.prisma.upload.findMany({
      where: { tabId, userId },
      include: { files: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const upload = await this.prisma.upload.findFirst({
      where: { id, userId },
      include: { files: true, tab: true },
    });
    if (!upload) throw new NotFoundException('Upload not found');
    return upload;
  }

  async create(dto: CreateUploadDto, userId: string) {
    return this.prisma.upload.create({
      data: {
        tabId: dto.tabId,
        userId,
        folderName: dto.folderName,
        contractNumber: dto.contractNumber,
        files: {
          create: dto.files.map((f) => ({
            originalFileName: f.originalFileName,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            storagePath: f.storagePath,
          })),
        },
      },
      include: { files: true },
    });
  }

  async createFromUploadedFiles(
    dto: IntakeUploadDto,
    files: UploadedFile[],
    userId: string,
  ) {
    if (files.length === 0) {
      throw new BadRequestException('No files were uploaded');
    }

    const upload = await this.prisma.upload.create({
      data: {
        tabId: dto.tabId,
        userId,
        folderName: dto.folderName,
        contractNumber: dto.contractNumber,
      },
    });

    const uploadDirectory = join(process.cwd(), 'runtime-uploads', upload.id);
    await mkdir(uploadDirectory, { recursive: true });

    const fileRecords = await Promise.all(
      files.map(async (file, index) => {
        const originalFileName = this.fixMulterFileName(file.originalname);
        const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = join(uploadDirectory, `${Date.now()}-${index}-${safeName}`);
        await writeFile(filePath, file.buffer);

        return {
          uploadId: upload.id,
          originalFileName,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          storagePath: filePath,
        };
      }),
    );

    await this.prisma.uploadFile.createMany({ data: fileRecords });

    return this.findOne(upload.id, userId);
  }

  async runOcr(id: string, userId: string) {
    const upload = await this.findOne(id, userId);

    await this.prisma.upload.update({
      where: { id },
      data: { status: UploadStatus.OCR_PROCESSING },
    });

    const namingRules = await this.namingRulesService.findAllByTab(upload.tabId);

    const result = await this.ocrService.extract(
      upload.files.map((f) => ({
        storagePath: f.storagePath,
        mimeType: f.mimeType,
        originalFileName: f.originalFileName,
      })),
      upload.tab.ocrPromptTemplate,
      {
        tabName: upload.tab.name,
        baseSharepointFolderPath: upload.tab.sharepointFolderPath,
        namingRules: namingRules.map((r: { documentType: string; pattern: string; description: string | null }) => ({
          documentType: r.documentType,
          pattern: r.pattern,
          description: r.description,
        })),
      },
    );

    const structured = this.normalizeStructuredResult((result.structured ?? {}) as UploadStructuredResult);

    return this.prisma.upload.update({
      where: { id },
      data: {
        status: UploadStatus.OCR_DONE,
        ocrRawResponse: result.raw as unknown as Prisma.InputJsonValue,
        ocrStructuredResult: structured as unknown as Prisma.InputJsonValue,
        ocrConfidence: result.confidence,
        needsReview: result.confidence < 0.8,
        contractNumber: structured.contractNumber ?? upload.contractNumber,
        customerName: structured.customerName ?? null,
        applicationNumber: structured.applicationNumber ?? null,
      },
      include: { files: true },
    });
  }

  async resolveDestination(id: string, userId: string, dto: ResolveUploadDto) {
    const upload = await this.findOne(id, userId);
    const structured = this.normalizeStructuredResult((upload.ocrStructuredResult ?? {}) as UploadStructuredResult);
    const requestedCustomerName = dto.customerName?.trim() || structured.customerName;
    const customerKana = dto.customerKana?.trim() || structured.customerKana;

    if (!requestedCustomerName) {
      throw new BadRequestException('customerName is required to resolve SharePoint destination');
    }

    const customerRootPath = this.buildCustomerRootPath(upload.tab.sharepointFolderPath, upload.tab.name, customerKana);
    const customerFolderMatches = await this.findCustomerFolderMatches(upload, customerRootPath, requestedCustomerName);
    const warnings: string[] = [];
    const autoMatchedCustomerFolder = customerFolderMatches.find((match) => match.isVariantExactMatch)?.folder ?? null;
    const customerNameCandidates = this.uniqueStrings([
      ...(structured.customerNameCandidates ?? []),
      requestedCustomerName,
      ...customerFolderMatches.map((match) => match.folder.name),
    ]);
    const customerName = autoMatchedCustomerFolder?.name ?? requestedCustomerName;
    const customerFolderPath = autoMatchedCustomerFolder?.path ?? this.joinFolderPath(customerRootPath, customerName);
    const customerFolder = autoMatchedCustomerFolder;

    if (autoMatchedCustomerFolder && autoMatchedCustomerFolder.name !== requestedCustomerName) {
      warnings.push(`SharePoint 上の既存顧客フォルダ「${autoMatchedCustomerFolder.name}」を候補として採用しました。`);
    } else if (customerFolderMatches.length > 0 && !autoMatchedCustomerFolder) {
      warnings.push(`近い顧客フォルダ候補があります。顧客名候補から選択して再解決してください: ${customerFolderMatches.map((match) => match.folder.name).join(' / ')}`);
    }

    let destinationResolution: DestinationResolution;

    if (!customerFolder) {
      const businessFolderName = this.getBusinessFolderName(upload.tab.name);
      const destinationPath = this.joinFolderPath(customerFolderPath, businessFolderName);

      destinationResolution = {
        customerName,
        customerKana,
        customerFolderPath,
        customerFolderExists: false,
        businessTabFound: false,
        destinationCandidates: [
          {
            absolutePath: destinationPath,
            exists: false,
            reason: '顧客フォルダが未作成のため、新規顧客フォルダ配下に業務タブを作成します。',
          },
        ],
        newFolderPlan: [customerFolderPath, destinationPath],
        warnings,
      };
    } else {
      const matchedBusinessFolders = await this.findBusinessFolders(upload, customerFolder.path);

      if (matchedBusinessFolders.length === 0) {
        const businessFolderName = this.getBusinessFolderName(upload.tab.name);
        const destinationPath = this.joinFolderPath(customerFolder.path, businessFolderName);

        destinationResolution = {
          customerName,
          customerKana,
          customerFolderPath: customerFolder.path,
          customerFolderExists: true,
          businessTabFound: false,
          destinationCandidates: [
            {
              absolutePath: destinationPath,
              exists: false,
              reason: '顧客配下に対象業務タブが無いため、新規作成して保存します。',
            },
          ],
          newFolderPlan: [destinationPath],
          warnings,
        };
      } else {
        const destinationCandidates = await this.collectDestinationCandidates(upload, matchedBusinessFolders, warnings);
        destinationResolution = {
          customerName,
          customerKana,
          customerFolderPath: customerFolder.path,
          customerFolderExists: true,
          businessTabFound: true,
          destinationCandidates,
          newFolderPlan: [],
          warnings,
        };
      }
    }

    const nextStructured: UploadStructuredResult = {
      ...structured,
      customerName,
      customerKana,
      customerNameCandidates,
      sharepointFolderPath: destinationResolution.destinationCandidates[0]?.absolutePath ?? '',
      destinationResolution,
    };

    return this.prisma.upload.update({
      where: { id },
      data: {
        customerName,
        ocrStructuredResult: nextStructured as unknown as Prisma.InputJsonValue,
      },
      include: { files: true },
    });
  }

  async confirm(id: string, userId: string, dto: ConfirmUploadDto) {
    const upload = await this.findOne(id, userId);

    const currentStructured = ((upload.ocrStructuredResult ?? {}) as UploadStructuredResult);
    const nextStructured: UploadStructuredResult = {
      ...currentStructured,
      ...(dto.ocrStructuredResult as UploadStructuredResult | undefined),
      contractNumber: dto.contractNumber ?? currentStructured.contractNumber,
      customerName: dto.customerName ?? currentStructured.customerName,
      customerKana: dto.customerKana ?? currentStructured.customerKana,
      applicationNumber: dto.applicationNumber ?? currentStructured.applicationNumber,
      sharepointFolderPath:
        dto.sharepointFolderPath ??
        (dto.ocrStructuredResult as UploadStructuredResult | undefined)?.sharepointFolderPath ??
        currentStructured.sharepointFolderPath,
    };

    if (!nextStructured.customerName?.trim()) {
      throw new BadRequestException('customerName must be confirmed before uploading');
    }

    if (!nextStructured.customerKana?.trim()) {
      throw new BadRequestException('customerKana must be confirmed before uploading');
    }

    if (!nextStructured.sharepointFolderPath?.trim()) {
      throw new BadRequestException('sharepointFolderPath must be confirmed before uploading');
    }

    return this.prisma.upload.update({
      where: { id },
      data: {
        status: UploadStatus.CONFIRMED,
        contractNumber: nextStructured.contractNumber ?? null,
        customerName: nextStructured.customerName ?? null,
        applicationNumber: nextStructured.applicationNumber ?? null,
        ocrStructuredResult: nextStructured as unknown as Prisma.InputJsonValue,
        confirmedAt: new Date(),
      },
      include: { files: true },
    });
  }

  async sendToSharepoint(id: string, userId: string) {
    const upload = await this.findOne(id, userId);
    const structured = (upload.ocrStructuredResult ?? {}) as UploadStructuredResult;
    const fileNameMap = new Map(
      (structured.fileResults ?? [])
        .filter((item) => item.originalFileName && item.outputFileName)
        .map((item) => [item.originalFileName as string, item.outputFileName as string]),
    );
    const folderPath = structured.sharepointFolderPath?.trim();

    if (!folderPath) {
      throw new BadRequestException('No confirmed SharePoint destination path is set');
    }

    if (upload.status !== UploadStatus.CONFIRMED) {
      throw new BadRequestException('Upload must be confirmed before sending to SharePoint');
    }

    await this.prisma.upload.update({
      where: { id },
      data: { status: UploadStatus.UPLOADING_SHAREPOINT },
    });

    const result = await this.sharepointService.uploadFiles({
      ...upload,
      tab: {
        ...upload.tab,
        sharepointFolderPath: folderPath,
      },
      files: upload.files.map((file) => ({
        storagePath: file.storagePath,
        mimeType: file.mimeType,
        originalFileName: fileNameMap.get(file.originalFileName) ?? file.originalFileName,
      })),
    });

    return this.prisma.upload.update({
      where: { id },
      data: {
        status: UploadStatus.COMPLETED,
        sharepointDestinationPath: result.folderPath,
        sharepointItemId: result.itemId,
        sharepointWebUrl: result.webUrl,
      },
      include: { files: true },
    });
  }

  private normalizeStructuredResult(structured: UploadStructuredResult): UploadStructuredResult {
    const customerName = structured.customerName?.trim() || '確認要クライアント';
    const customerKanaCandidates = this.uniqueStrings([
      ...(structured.customerKanaCandidates ?? []),
      structured.customerKana,
    ]);
    const customerNameCandidates = this.uniqueStrings([
      ...(structured.customerNameCandidates ?? []),
      structured.customerName,
    ]);

    return {
      ...structured,
      customerName,
      customerKana: structured.customerKana?.trim() || customerKanaCandidates[0] || '',
      customerNameCandidates: customerNameCandidates.length > 0 ? customerNameCandidates : [customerName],
      customerKanaCandidates,
      sharepointFolderPath: structured.sharepointFolderPath?.trim() || '',
    };
  }

  private async findBusinessFolders(upload: Awaited<ReturnType<UploadsService['findOne']>>, customerFolderPath: string) {
    const aliases = this.getBusinessFolderAliases(upload.tab.name);
    const visited = new Set<string>();
    const matches: SharepointFolderEntry[] = [];
    let currentLevel: Array<{ path: string; depth: number }> = [{ path: customerFolderPath, depth: 0 }];

    while (currentLevel.length > 0 && visited.size < MAX_DESTINATION_CANDIDATES) {
      const toExpand = currentLevel.filter((entry) => {
        if (visited.has(entry.path)) return false;
        visited.add(entry.path);
        return true;
      });

      if (toExpand.length === 0) break;

      const childrenBatches = await Promise.all(
        toExpand.map((entry) =>
          this.cachedListFolders(upload, entry.path).then((children) => ({ entry, children })),
        ),
      );

      const nextLevel: Array<{ path: string; depth: number }> = [];
      for (const { entry, children } of childrenBatches) {
        for (const child of children) {
          if (aliases.includes(child.name)) {
            matches.push(child);
          }
          if (!visited.has(child.path) && entry.depth + 1 < MAX_BFS_DEPTH) {
            nextLevel.push({ path: child.path, depth: entry.depth + 1 });
          }
        }
      }
      currentLevel = nextLevel;
    }

    return matches;
  }

  private async collectDestinationCandidates(
    upload: Awaited<ReturnType<UploadsService['findOne']>>,
    businessFolders: SharepointFolderEntry[],
    warnings: string[],
  ): Promise<DestinationCandidate[]> {
    const visited = new Set<string>();
    const candidates: DestinationCandidate[] = [];
    let currentLevel: Array<{ path: string; depth: number }> = businessFolders.map((folder) => ({
      path: folder.path,
      depth: 0,
    }));

    while (currentLevel.length > 0 && candidates.length < MAX_DESTINATION_CANDIDATES) {
      const expandable: Array<{ path: string; depth: number }> = [];

      for (const entry of currentLevel) {
        if (candidates.length >= MAX_DESTINATION_CANDIDATES) {
          break;
        }
        if (visited.has(entry.path)) {
          continue;
        }
        visited.add(entry.path);
        candidates.push({
          absolutePath: entry.path,
          exists: true,
          reason: '顧客配下で見つかった既存フォルダです。',
        });
        if (entry.depth + 1 < MAX_BFS_DEPTH) {
          expandable.push(entry);
        }
      }

      if (expandable.length === 0) {
        break;
      }

      const childrenBatches = await Promise.all(
        expandable.map((entry) =>
          this.cachedListFolders(upload, entry.path).then((children) => ({ entry, children })),
        ),
      );

      const nextLevel: Array<{ path: string; depth: number }> = [];
      for (const { entry, children } of childrenBatches) {
        for (const child of children) {
          if (!visited.has(child.path)) {
            nextLevel.push({ path: child.path, depth: entry.depth + 1 });
          }
        }
      }
      currentLevel = nextLevel;
    }

    if (candidates.length >= MAX_DESTINATION_CANDIDATES) {
      warnings.push('候補パス数が多いため、一部のみ表示しています。');
    }

    return candidates;
  }

  private async cachedListFolders(
    upload: Awaited<ReturnType<UploadsService['findOne']>>,
    folderPath: string,
  ): Promise<SharepointFolderEntry[]> {
    const cacheKey = `${upload.tab.sharepointDriveId ?? ''}::${folderPath}`;
    const cached = this.folderListCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < FOLDER_CACHE_TTL_MS) {
      return cached.folders;
    }

    const folders = await this.sharepointService.listFolders({
      siteId: upload.tab.sharepointSiteId,
      driveId: upload.tab.sharepointDriveId,
      folderPath,
    });

    this.folderListCache.set(cacheKey, { folders, cachedAt: Date.now() });
    return folders;
  }

  private async findCustomerFolderMatches(
    upload: Awaited<ReturnType<UploadsService['findOne']>>,
    customerRootPath: string,
    requestedCustomerName: string,
  ): Promise<CustomerFolderMatch[]> {
    const folders = await this.cachedListFolders(upload, customerRootPath);

    return folders
      .map((folder) => {
        const score = this.scoreCustomerFolderName(requestedCustomerName, folder.name);
        return {
          folder,
          score,
          isVariantExactMatch: this.hasExactCustomerNameVariantMatch(requestedCustomerName, folder.name),
        } satisfies CustomerFolderMatch;
      })
      .filter((match) => match.isVariantExactMatch || match.score >= 0.55)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.folder.name.localeCompare(right.folder.name, 'ja');
      })
      .slice(0, 8);
  }

  private buildCustomerRootPath(
    configuredPath: string | null | undefined,
    tabName: string,
    customerKana: string | null | undefined,
  ) {
    const baseRoot = this.getCustomerSearchBasePath(configuredPath, tabName);
    const buckets = this.buildKanaBuckets(customerKana);
    return this.joinFolderPath(baseRoot, ...buckets);
  }

  private getCustomerSearchBasePath(configuredPath: string | null | undefined, tabName: string) {
    const normalized = (configuredPath ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      return 'スキャナ';
    }

    const segments = normalized.split('/').filter(Boolean);
    const scannerIndex = segments.findIndex((segment) => segment === 'スキャナ');

    if (scannerIndex >= 0) {
      return segments.slice(0, scannerIndex + 1).join('/');
    }

    const aliases = this.getBusinessFolderAliases(tabName);
    const lastSegment = segments[segments.length - 1];

    if (aliases.includes(lastSegment)) {
      return 'スキャナ';
    }

    if (segments.some((segment) => /^(general|ai\s*ocr|aiocr)$/i.test(segment))) {
      return 'スキャナ';
    }

    return normalized;
  }

  private getBusinessFolderAliases(tabName: string) {
    return BUSINESS_FOLDER_ALIASES[tabName] ?? [tabName];
  }

  private getBusinessFolderName(tabName: string) {
    return this.getBusinessFolderAliases(tabName)[0];
  }

  private scoreCustomerFolderName(requestedCustomerName: string, actualFolderName: string) {
    const requestedVariants = this.buildCustomerNameVariants(requestedCustomerName);
    const actualVariants = this.buildCustomerNameVariants(actualFolderName);
    let bestScore = 0;

    for (const requested of requestedVariants) {
      for (const actual of actualVariants) {
        if (!requested || !actual) {
          continue;
        }

        if (requested === actual) {
          return 1;
        }

        if (requested.includes(actual) || actual.includes(requested)) {
          const shorterLength = Math.min(requested.length, actual.length);
          const longerLength = Math.max(requested.length, actual.length);
          bestScore = Math.max(bestScore, 0.9 + shorterLength / Math.max(longerLength, 1) * 0.09);
          continue;
        }

        bestScore = Math.max(bestScore, this.calculateDiceCoefficient(requested, actual));
      }
    }

    return bestScore;
  }

  private hasExactCustomerNameVariantMatch(requestedCustomerName: string, actualFolderName: string) {
    const requestedVariants = this.buildCustomerNameVariants(requestedCustomerName);
    const actualVariants = new Set(this.buildCustomerNameVariants(actualFolderName));

    return requestedVariants.some((variant) => actualVariants.has(variant));
  }

  private buildCustomerNameVariants(value: string) {
    const normalized = value.normalize('NFKC').toLowerCase();
    const collapsed = normalized.replace(/\s+/g, '');
    const sanitized = collapsed.replace(/[・･,，.。/／\\＿_\-ー'"`]/g, '');
    const withoutBracketContent = sanitized.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】|<[^>]*>|＜[^＞]*＞/g, '');
    const withoutCompanyDesignator = sanitized.replace(/株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|社会福祉法人|一般社団法人|一般財団法人|（株）|\(株\)|㈱|Inc\.?|Co\.?Ltd\.?|LLC|Ltd\.?|Corp\.?/gi, '');
    const withoutBoth = withoutBracketContent.replace(/株式会社|有限会社|合同会社|合資会社|合名会社|医療法人|社会福祉法人|一般社団法人|一般財団法人|（株）|\(株\)|㈱|Inc\.?|Co\.?Ltd\.?|LLC|Ltd\.?|Corp\.?/gi, '');

    return this.uniqueStrings([normalized, collapsed, sanitized, withoutBracketContent, withoutCompanyDesignator, withoutBoth]);
  }

  private calculateDiceCoefficient(left: string, right: string) {
    if (!left || !right) {
      return 0;
    }

    if (left === right) {
      return 1;
    }

    if (left.length === 1 || right.length === 1) {
      return left === right ? 1 : 0;
    }

    const leftBigrams = this.buildBigrams(left);
    const rightBigrams = this.buildBigrams(right);

    if (leftBigrams.length === 0 || rightBigrams.length === 0) {
      return 0;
    }

    const rightCounts = new Map<string, number>();
    for (const bigram of rightBigrams) {
      rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
    }

    let overlap = 0;
    for (const bigram of leftBigrams) {
      const count = rightCounts.get(bigram) ?? 0;
      if (count > 0) {
        overlap += 1;
        rightCounts.set(bigram, count - 1);
      }
    }

    return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
  }

  private buildBigrams(value: string) {
    const chars = Array.from(value);
    const bigrams: string[] = [];

    for (let index = 0; index < chars.length - 1; index += 1) {
      bigrams.push(`${chars[index]}${chars[index + 1]}`);
    }

    return bigrams;
  }

  private buildKanaBuckets(customerKana: string | null | undefined) {
    const firstKana = this.extractKanaIndexChar(customerKana);

    if (!firstKana) {
      return [];
    }

    const row = this.resolveKanaRow(firstKana);
    const column = this.resolveKanaBucket(firstKana);

    return [row, column].filter(Boolean);
  }

  private toHiragana(value: string) {
    return value.replace(/[ァ-ヴヽヾ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }

  private extractKanaIndexChar(value: string | null | undefined) {
    const normalized = this.toHiragana((value ?? '').normalize('NFKC').trim());

    for (const char of Array.from(normalized)) {
      if (/\s/.test(char)) {
        continue;
      }

      const indexChar = this.normalizeKanaIndexChar(char);
      if (this.isSupportedKanaIndexChar(indexChar)) {
        return indexChar;
      }
    }

    return '';
  }

  private normalizeKanaIndexChar(char: string) {
    const normalizedMap: Record<string, string> = {
      'ぁ': 'あ',
      'ぃ': 'い',
      'ぅ': 'う',
      'ぇ': 'え',
      'ぉ': 'お',
      'ゕ': 'か',
      'ゖ': 'け',
      'ゔ': 'う',
      'が': 'か',
      'ぎ': 'き',
      'ぐ': 'く',
      'げ': 'け',
      'ご': 'こ',
      'ざ': 'さ',
      'じ': 'し',
      'ず': 'す',
      'ぜ': 'せ',
      'ぞ': 'そ',
      'だ': 'た',
      'ぢ': 'ち',
      'づ': 'つ',
      'で': 'て',
      'ど': 'と',
      'ば': 'は',
      'び': 'ひ',
      'ぶ': 'ふ',
      'べ': 'へ',
      'ぼ': 'ほ',
      'ぱ': 'は',
      'ぴ': 'ひ',
      'ぷ': 'ふ',
      'ぺ': 'へ',
      'ぽ': 'ほ',
      'っ': 'つ',
      'ゃ': 'や',
      'ゅ': 'ゆ',
      'ょ': 'よ',
      'ゎ': 'わ',
    };

    return normalizedMap[char] ?? char;
  }

  private isSupportedKanaIndexChar(char: string) {
    return Boolean(this.resolveKanaRow(char) && this.resolveKanaBucket(char));
  }

  private resolveKanaRow(char: string) {
    const rowMap: Record<string, string> = {
      'あ': 'あ', 'い': 'あ', 'う': 'あ', 'え': 'あ', 'お': 'あ',
      'か': 'か', 'き': 'か', 'く': 'か', 'け': 'か', 'こ': 'か',
      'さ': 'さ', 'し': 'さ', 'す': 'さ', 'せ': 'さ', 'そ': 'さ',
      'た': 'た', 'ち': 'た', 'つ': 'た', 'て': 'た', 'と': 'た',
      'な': 'な', 'に': 'な', 'ぬ': 'な', 'ね': 'な', 'の': 'な',
      'は': 'は', 'ひ': 'は', 'ふ': 'は', 'へ': 'は', 'ほ': 'は',
      'ま': 'ま', 'み': 'ま', 'む': 'ま', 'め': 'ま', 'も': 'ま',
      'や': 'や', 'ゆ': 'や', 'よ': 'や',
      'ら': 'ら', 'り': 'ら', 'る': 'ら', 'れ': 'ら', 'ろ': 'ら',
      'わ': 'わ', 'を': 'わ', 'ん': 'わ',
    };

    return rowMap[char] ?? '';
  }

  private resolveKanaBucket(char: string) {
    const bucketMap: Record<string, string> = {
      'あ': 'あ', 'い': 'い', 'う': 'う', 'え': 'え', 'お': 'お',
      'か': 'か', 'き': 'き', 'く': 'く', 'け': 'け', 'こ': 'こ',
      'さ': 'さ', 'し': 'し', 'す': 'す', 'せ': 'せ', 'そ': 'そ',
      'た': 'た', 'ち': 'ち', 'つ': 'つ', 'て': 'て', 'と': 'と',
      'な': 'な', 'に': 'に', 'ぬ': 'ぬ', 'ね': 'ね', 'の': 'の',
      'は': 'は', 'ひ': 'ひ', 'ふ': 'ふ', 'へ': 'へ', 'ほ': 'ほ',
      'ま': 'ま', 'み': 'み', 'む': 'む', 'め': 'め', 'も': 'も',
      'や': 'や', 'ゆ': 'ゆ', 'よ': 'よ',
      'ら': 'ら', 'り': 'り', 'る': 'る', 'れ': 'れ', 'ろ': 'ろ',
      'わ': 'わ', 'を': 'を', 'ん': 'ん',
    };

    return bucketMap[char] ?? '';
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  }

  private joinFolderPath(...segments: Array<string | null | undefined>) {
    return segments
      .map((segment) => segment?.trim().replace(/^\/+|\/+$/g, '') ?? '')
      .filter(Boolean)
      .join('/');
  }

  private fixMulterFileName(rawName: string): string {
    // multer decodes Content-Disposition filenames as Latin-1 by default,
    // so UTF-8 Japanese filenames arrive as mojibake. Re-encode as Latin-1
    // bytes and decode as UTF-8 to recover the original name.
    try {
      const bytes = Buffer.from(rawName, 'latin1');
      const decoded = bytes.toString('utf8');
      // If decoding produces valid-looking text (no replacement chars), use it
      if (!decoded.includes('\ufffd') && decoded !== rawName) {
        return decoded;
      }
    } catch {
      // Fall through to return rawName as-is
    }
    return rawName;
  }

  async loadFileForPreview(uploadId: string, fileId: string, userId: string) {
    const upload = await this.findOne(uploadId, userId);
    const file = upload.files.find((item) => item.id === fileId);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const buffer = await this.loadStorageBuffer(file.storagePath);
    return {
      buffer,
      mimeType: file.mimeType ?? 'application/octet-stream',
      fileName: file.originalFileName,
    };
  }

  private async loadStorageBuffer(storagePath: string): Promise<Buffer> {
    if (!storagePath) {
      throw new NotFoundException('storagePath is empty');
    }

    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      const response = await fetch(storagePath);
      if (!response.ok) {
        throw new NotFoundException(`Failed to download file from URL: ${storagePath}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }

    if (storagePath.startsWith('gs://')) {
      const withoutScheme = storagePath.replace('gs://', '');
      const [bucketName, ...rest] = withoutScheme.split('/');
      const filePath = rest.join('/');
      const [buffer] = await admin.storage().bucket(bucketName).file(filePath).download();
      return buffer;
    }

    try {
      return await readFile(storagePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(
          '元ファイルが見つかりません。再デプロイ等でアップロード済みファイルが失われた可能性があります。',
        );
      }
      throw err;
    }
  }
}
