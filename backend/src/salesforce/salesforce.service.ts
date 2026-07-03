import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SalesforceContactMatch {
  id: string;
  name: string;
  accountName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  exactMatch: boolean;
}

export interface SalesforceContactSearchResult {
  configured: boolean;
  query: string;
  exists: boolean;
  matchCount: number;
  matches: SalesforceContactMatch[];
}

export type SalesforcePersonSource = 'contact' | 'torihikisaki_tantou';

export interface SalesforcePersonMatch {
  source: SalesforcePersonSource;
  sourceLabel: string;
  id: string;
  name: string;
  kana: string | null;
  company: string | null;
  url: string;
}

export interface PersonQuery {
  lastName?: string;
  firstName?: string;
  fullName?: string;
  kana?: string;
}

export interface SalesforcePersonSearchResult {
  configured: boolean;
  query: string;
  lastName: string;
  firstName: string;
  exists: boolean;
  matchCount: number;
  matches: SalesforcePersonMatch[];
}

interface CachedToken {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
}

const SALESFORCE_API_VERSION = 'v59.0';
// 独自オブジェクト「取引先担当者」(キープレフィックス a0l 系列の a0m)。
// 人名は Name(自動採番) ではなく sei__c(姓)/name__c(姓名)/furigana__c(フリガナ) に入っている。
const CUSTOM_CONTACT_OBJECT = 'CustomObject_torihisaki_tantou__c';
// Re-use an access token for a few minutes; refetch defensively before it gets stale.
const TOKEN_REUSE_MS = 25 * 60 * 1000;

@Injectable()
export class SalesforceService {
  private readonly logger = new Logger(SalesforceService.name);
  private cachedToken: CachedToken | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('SALESFORCE_CONSUMER_KEY') &&
        this.configService.get<string>('SALESFORCE_CONSUMER_SECRET'),
    );
  }

  private getLoginUrl(): string {
    return (
      this.configService.get<string>('SALESFORCE_LOGIN_URL')?.trim() ||
      'https://login.salesforce.com'
    ).replace(/\/+$/, '');
  }

  /**
   * OAuth 2.0 Client Credentials flow. The Connected App must have the flow
   * enabled and a "Run As" user assigned; the token is then scoped to that user.
   */
  private async fetchAccessToken(): Promise<CachedToken> {
    const loginUrl = this.getLoginUrl();
    const clientId = this.configService.get<string>('SALESFORCE_CONSUMER_KEY') ?? '';
    const clientSecret = this.configService.get<string>('SALESFORCE_CONSUMER_SECRET') ?? '';

    const response = await fetch(`${loginUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const error = (data.error as string) ?? 'unknown_error';
      const description = (data.error_description as string) ?? 'No description';
      throw new Error(`Salesforce token request failed (${error}): ${description}`);
    }

    const accessToken = data.access_token as string | undefined;
    const instanceUrl = data.instance_url as string | undefined;

    if (!accessToken || !instanceUrl) {
      throw new Error('Salesforce token response did not include access_token/instance_url');
    }

    return {
      accessToken,
      instanceUrl: instanceUrl.replace(/\/+$/, ''),
      expiresAt: Date.now() + TOKEN_REUSE_MS,
    };
  }

  private async getToken(forceRefresh = false): Promise<CachedToken> {
    if (!forceRefresh && this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken;
    }
    this.cachedToken = await this.fetchAccessToken();
    return this.cachedToken;
  }

  /** Escape a value for safe interpolation inside a single-quoted SOQL string. */
  private escapeSoql(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private async runQuery(soql: string): Promise<Record<string, unknown>[]> {
    let token = await this.getToken();
    const buildUrl = (t: CachedToken) =>
      `${t.instanceUrl}/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soql)}`;

    let response = await fetch(buildUrl(token), {
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });

    // Token may have been revoked/expired server-side — refresh once and retry.
    if (response.status === 401) {
      token = await this.getToken(true);
      response = await fetch(buildUrl(token), {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const detail = Array.isArray(data)
        ? JSON.stringify(data)
        : (data.message as string) ?? JSON.stringify(data);
      throw new Error(`Salesforce query failed (${response.status}): ${detail}`);
    }

    return (data.records as Record<string, unknown>[]) ?? [];
  }

  /**
   * Check whether a customer name exists among Salesforce Contacts (顧客担当者).
   * Returns both exact and partial (LIKE) matches.
   */
  async searchContacts(name: string): Promise<SalesforceContactSearchResult> {
    const query = name.trim();

    if (!this.isConfigured()) {
      return { configured: false, query, exists: false, matchCount: 0, matches: [] };
    }

    if (!query) {
      return { configured: true, query, exists: false, matchCount: 0, matches: [] };
    }

    const escaped = this.escapeSoql(query);
    const soql = `SELECT Id, Name, Account.Name, Email, Phone, Title FROM Contact WHERE Name LIKE '%${escaped}%' ORDER BY Name LIMIT 25`;

    const records = await this.runQuery(soql);

    const matches: SalesforceContactMatch[] = records.map((record) => {
      const account = record.Account as { Name?: string } | null | undefined;
      const recordName = (record.Name as string) ?? '';
      return {
        id: (record.Id as string) ?? '',
        name: recordName,
        accountName: account?.Name ?? null,
        email: (record.Email as string) ?? null,
        phone: (record.Phone as string) ?? null,
        title: (record.Title as string) ?? null,
        exactMatch: recordName.trim() === query,
      };
    });

    // Surface exact matches first.
    matches.sort((a, b) => Number(b.exactMatch) - Number(a.exactMatch));

    return {
      configured: true,
      query,
      exists: matches.length > 0,
      matchCount: matches.length,
      matches,
    };
  }

  /**
   * 紙の名簿から読み取った1名を、Salesforceの2つの人物マスタで照合する。
   *  - 顧客担当者(Contact・標準): Name を 姓/名 の部分一致で検索
   *  - 取引先担当者(独自 a0m): sei__c(姓)/name__c(姓名) を部分一致で検索
   * 姓と名の両方があれば AND 条件、姓のみなら姓だけで広めに拾う。
   */
  async searchPeople(input: PersonQuery): Promise<SalesforcePersonSearchResult> {
    let lastName = (input.lastName ?? '').trim();
    let firstName = (input.firstName ?? '').trim();
    const kana = (input.kana ?? '').trim();
    const fullName = (input.fullName ?? '').trim();

    // fullName しか無い場合は空白で姓名を分割する。
    if (!lastName && !firstName && fullName) {
      const parts = fullName.split(/[\s　]+/).filter(Boolean);
      lastName = parts[0] ?? '';
      firstName = parts.slice(1).join('');
    }

    const displayQuery = [lastName, firstName].filter(Boolean).join(' ') || fullName;

    if (!this.isConfigured()) {
      return { configured: false, query: displayQuery, lastName, firstName, exists: false, matchCount: 0, matches: [] };
    }
    if (!lastName && !firstName) {
      return { configured: true, query: displayQuery, lastName, firstName, exists: false, matchCount: 0, matches: [] };
    }

    const token = await this.getToken();
    const matches: SalesforcePersonMatch[] = [];

    // 1) 顧客担当者 (Contact)
    const contactWhere = this.buildContactNameWhere(lastName, firstName);
    if (contactWhere) {
      const soql = `SELECT Id, Name, Account.Name FROM Contact WHERE ${contactWhere} ORDER BY Name LIMIT 10`;
      const records = await this.runQuery(soql);
      for (const record of records) {
        const account = record.Account as { Name?: string } | null | undefined;
        const id = (record.Id as string) ?? '';
        matches.push({
          source: 'contact',
          sourceLabel: '顧客担当者',
          id,
          name: (record.Name as string) ?? '',
          kana: null,
          company: account?.Name ?? null,
          url: `${token.instanceUrl}/${id}`,
        });
      }
    }

    // 2) 取引先担当者 (独自 a0m)
    const customWhere = this.buildCustomContactNameWhere(lastName, firstName);
    if (customWhere) {
      const soql = `SELECT Id, sei__c, name__c, furigana__c, torihikisaki_name__c FROM ${CUSTOM_CONTACT_OBJECT} WHERE ${customWhere} LIMIT 10`;
      const records = await this.runQuery(soql);
      for (const record of records) {
        const sei = (record.sei__c as string) ?? '';
        const namae = (record.name__c as string) ?? '';
        // name__c には「姓　名」全体が入っていることが多いので、そのまま表示名にする。
        const display = (namae.includes(sei) || !sei ? namae : `${sei} ${namae}`).trim();
        const id = (record.Id as string) ?? '';
        matches.push({
          source: 'torihikisaki_tantou',
          sourceLabel: '取引先担当者',
          id,
          name: display || sei,
          kana: (record.furigana__c as string) ?? null,
          company: (record.torihikisaki_name__c as string) ?? null,
          url: `${token.instanceUrl}/${id}`,
        });
      }
    }

    return {
      configured: true,
      query: displayQuery,
      lastName,
      firstName,
      exists: matches.length > 0,
      matchCount: matches.length,
      matches,
    };
  }

  /** Contact.Name 用の WHERE 句（姓 AND 名 / 片方のみは部分一致）。 */
  private buildContactNameWhere(lastName: string, firstName: string): string {
    const conditions: string[] = [];
    if (lastName) conditions.push(`Name LIKE '%${this.escapeSoql(lastName)}%'`);
    if (firstName) conditions.push(`Name LIKE '%${this.escapeSoql(firstName)}%'`);
    return conditions.join(' AND ');
  }

  /** 取引先担当者(独自) 用の WHERE 句。姓のみのときは sei__c/name__c の両方を見る。 */
  private buildCustomContactNameWhere(lastName: string, firstName: string): string {
    if (lastName && firstName) {
      return `sei__c LIKE '%${this.escapeSoql(lastName)}%' AND name__c LIKE '%${this.escapeSoql(firstName)}%'`;
    }
    if (lastName) {
      const s = this.escapeSoql(lastName);
      return `(sei__c LIKE '%${s}%' OR name__c LIKE '%${s}%')`;
    }
    if (firstName) {
      return `name__c LIKE '%${this.escapeSoql(firstName)}%'`;
    }
    return '';
  }
}
