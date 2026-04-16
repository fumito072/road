import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { readFile } from 'node:fs/promises';

export interface SharepointUploadResult {
  folderPath: string;
  itemId: string;
  webUrl: string;
}

export interface SharepointFolderEntry {
  id: string;
  name: string;
  path: string;
  webUrl: string;
}

type SharepointItem = {
  id: string;
  name: string;
  webUrl: string;
  folder?: Record<string, unknown>;
  parentReference?: {
    path?: string;
  };
};

@Injectable()
export class SharepointService {
  private readonly logger = new Logger(SharepointService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Upload files to SharePoint via Microsoft Graph API.
   */
  async uploadFiles(upload: {
    tab: { sharepointSiteId?: string | null; sharepointDriveId?: string | null; sharepointFolderPath?: string | null };
    files: Array<{ storagePath: string; originalFileName: string; mimeType?: string | null }>;
    contractNumber?: string | null;
  }): Promise<SharepointUploadResult> {
    const siteId = upload.tab.sharepointSiteId?.trim();
    const configuredFolderPath = upload.tab.sharepointFolderPath?.trim();

    if (!siteId) {
      throw new BadRequestException('sharepointSiteId is not configured for the selected tab');
    }

    if (!configuredFolderPath) {
      throw new BadRequestException('sharepointFolderPath is not configured for the selected tab');
    }

    if (upload.files.length === 0) {
      throw new BadRequestException('No files to upload to SharePoint');
    }

    const accessToken = await this.getAccessToken();
    const driveId = await this.resolveDriveId(accessToken, siteId, upload.tab.sharepointDriveId ?? null);
    const folderPath = this.normalizeFolderPath(configuredFolderPath);

    this.logger.log(
      `Uploading ${upload.files.length} file(s) to SharePoint site=${siteId} drive=${driveId} path=${folderPath}`,
    );

    const folderItem = await this.ensureFolderPath(accessToken, driveId, folderPath);

    for (const file of upload.files) {
      const fileBuffer = await this.loadFileBuffer(file.storagePath);
      const fileName = file.originalFileName;

      await this.graphRequest<SharepointItem>(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${this.encodeGraphPath(`${folderPath}/${fileName}`)}:/content`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': file.mimeType ?? 'application/octet-stream',
          },
          body: new Uint8Array(fileBuffer),
        },
      );

      this.logger.log(`Uploaded ${fileName} to SharePoint folder ${folderPath}`);
    }

    return {
      folderPath,
      itemId: folderItem.id,
      webUrl: folderItem.webUrl,
    };
  }

  async getFolderByPath(config: {
    siteId?: string | null;
    driveId?: string | null;
    folderPath?: string | null;
  }): Promise<SharepointFolderEntry | null> {
    const siteId = config.siteId?.trim();
    const folderPath = this.normalizeFolderPath(config.folderPath?.trim() ?? '');

    if (!siteId || !folderPath) {
      return null;
    }

    const accessToken = await this.getAccessToken();
    const driveId = await this.resolveDriveId(accessToken, siteId, config.driveId ?? null);
    const item = await this.getItemByPath(accessToken, driveId, folderPath);

    if (!item?.folder) {
      return null;
    }

    return this.toFolderEntry(item, folderPath);
  }

  async listFolders(config: {
    siteId?: string | null;
    driveId?: string | null;
    folderPath?: string | null;
  }): Promise<SharepointFolderEntry[]> {
    const siteId = config.siteId?.trim();
    if (!siteId) {
      throw new BadRequestException('sharepointSiteId is not configured for the selected tab');
    }

    const folderPath = this.normalizeFolderPath(config.folderPath?.trim() ?? '');
    const accessToken = await this.getAccessToken();
    const driveId = await this.resolveDriveId(accessToken, siteId, config.driveId ?? null);
    const children = await this.listChildrenByPath(accessToken, driveId, folderPath);

    return children
      .filter((item) => item.folder)
      .map((item) => this.toFolderEntry(item, folderPath ? `${folderPath}/${item.name}` : item.name));
  }

  private async getAccessToken(): Promise<string> {
    const tenantId = this.config.get<string>('AZURE_TENANT_ID');
    const clientId = this.config.get<string>('AZURE_CLIENT_ID');
    const clientSecret = this.config.get<string>('AZURE_CLIENT_SECRET');

    if (!tenantId || !clientId || !clientSecret) {
      throw new BadRequestException('Azure SharePoint credentials are not fully configured');
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      },
    );

    const json = (await response.json()) as { access_token?: string; error_description?: string };

    if (!response.ok || !json.access_token) {
      throw new InternalServerErrorException(
        `Failed to acquire Microsoft Graph access token: ${json.error_description ?? response.statusText}`,
      );
    }

    return json.access_token;
  }

  private async resolveDriveId(
    accessToken: string,
    siteId: string,
    configuredDriveId?: string | null,
  ): Promise<string> {
    if (configuredDriveId?.trim()) {
      return configuredDriveId.trim();
    }

    const drives = await this.graphRequest<{ value: Array<{ id: string; driveType?: string }> }>(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const drive = drives.value.find((item) => item.driveType === 'documentLibrary') ?? drives.value[0];

    if (!drive) {
      throw new BadRequestException(`No SharePoint drive found for site ${siteId}`);
    }

    return drive.id;
  }

  private async ensureFolderPath(
    accessToken: string,
    driveId: string,
    folderPath: string,
  ): Promise<SharepointItem> {
    const segments = folderPath.split('/').filter(Boolean);

    if (segments.length === 0) {
      return this.graphRequest<SharepointItem>(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/root`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    }

    let parentId = 'root';
    let currentPath = '';
    let lastItem: SharepointItem | null = null;

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = await this.getItemByPath(accessToken, driveId, currentPath);

      if (existing) {
        parentId = existing.id;
        lastItem = existing;
        continue;
      }

      const created = await this.graphRequest<SharepointItem>(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: segment,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          }),
        },
      );

      parentId = created.id;
      lastItem = created;
    }

    if (!lastItem) {
      throw new InternalServerErrorException(`Failed to resolve SharePoint folder path: ${folderPath}`);
    }

    return lastItem;
  }

  private async getItemByPath(
    accessToken: string,
    driveId: string,
    path: string,
  ): Promise<SharepointItem | null> {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${this.encodeGraphPath(path)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (response.status === 404) {
      return null;
    }

    const json = (await response.json()) as SharepointItem & {
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Failed to resolve SharePoint path ${path}: ${json.error?.message ?? response.statusText}`,
      );
    }

    return json;
  }

  private async listChildrenByPath(
    accessToken: string,
    driveId: string,
    path: string,
  ): Promise<SharepointItem[]> {
    const target = path
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${this.encodeGraphPath(path)}:/children`
      : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

    const response = await fetch(target, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = (await response.json().catch(() => ({}))) as {
      value?: SharepointItem[];
      error?: { message?: string };
    };

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Failed to list SharePoint children for ${path || '/'}: ${json.error?.message ?? response.statusText}`,
      );
    }

    return json.value ?? [];
  }

  private async loadFileBuffer(storagePath: string): Promise<Buffer> {
    if (!storagePath) {
      throw new BadRequestException('storagePath is empty');
    }

    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      const response = await fetch(storagePath);
      if (!response.ok) {
        throw new InternalServerErrorException(`Failed to download file from URL: ${storagePath}`);
      }

      return Buffer.from(await response.arrayBuffer());
    }

    if (storagePath.startsWith('gs://')) {
      const { bucketName, filePath } = this.parseGsUri(storagePath);
      const [buffer] = await admin.storage().bucket(bucketName).file(filePath).download();
      return buffer;
    }

    if (storagePath.startsWith('/') || storagePath.startsWith('./') || storagePath.startsWith('../')) {
      return readFile(storagePath);
    }

    const defaultBucket = this.config.get<string>('FIREBASE_STORAGE_BUCKET');
    if (!defaultBucket) {
      throw new BadRequestException(
        `FIREBASE_STORAGE_BUCKET is not configured, so storagePath cannot be resolved: ${storagePath}`,
      );
    }

    const [buffer] = await admin
      .storage()
      .bucket(defaultBucket)
      .file(storagePath.replace(/^\/+/, ''))
      .download();
    return buffer;
  }

  private parseGsUri(storagePath: string): { bucketName: string; filePath: string } {
    const normalized = storagePath.replace('gs://', '');
    const slashIndex = normalized.indexOf('/');

    if (slashIndex === -1) {
      throw new BadRequestException(`Invalid gs:// storagePath: ${storagePath}`);
    }

    return {
      bucketName: normalized.slice(0, slashIndex),
      filePath: normalized.slice(slashIndex + 1),
    };
  }

  private normalizeFolderPath(folderPath: string): string {
    return folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  private toFolderEntry(item: SharepointItem, fallbackPath: string): SharepointFolderEntry {
    const parentPath = item.parentReference?.path
      ?.replace(/^\/drives\/[^/]+\/root:?/, '')
      .replace(/^\/+/, '');
    const resolvedPath = this.normalizeFolderPath(
      fallbackPath || [parentPath, item.name].filter(Boolean).join('/'),
    );

    return {
      id: item.id,
      name: item.name,
      path: resolvedPath,
      webUrl: item.webUrl,
    };
  }

  private encodeGraphPath(path: string): string {
    return path
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private async graphRequest<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const json = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: string };
    };

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Microsoft Graph request failed (${response.status}): ${json.error?.message ?? response.statusText}`,
      );
    }

    return json;
  }
}
