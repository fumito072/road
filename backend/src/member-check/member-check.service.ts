import { BadRequestException, Injectable } from '@nestjs/common';
import { ExtractedPerson, OcrService } from '../ocr/ocr.service';
import { SalesforcePersonSearchResult, SalesforceService } from '../salesforce/salesforce.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
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

// Salesforce へ同時に投げすぎないよう、少しずつ照合する。
const SALESFORCE_LOOKUP_CONCURRENCY = 6;

@Injectable()
export class MemberCheckService {
  constructor(
    private readonly ocrService: OcrService,
    private readonly salesforceService: SalesforceService,
  ) {}

  async scanRoster(file?: UploadedImage): Promise<MemberCheckResult> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('画像ファイルがアップロードされていません。');
    }

    const extraction = await this.ocrService.extractPeopleList({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
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
          const salesforce = await this.salesforceService.searchPeople({
            lastName: person.lastName,
            firstName: person.firstName,
            fullName: person.fullName,
            kana: person.kana,
          });
          return { index: start + offset, person: { ...person, salesforce } };
        }),
      );
      for (const result of results) {
        people[result.index] = result.person;
      }
    }

    return people;
  }
}
