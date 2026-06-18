import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTabDto, UpdateTabDto } from './tabs.dto';
import { isForeignKeyConstraintError } from '../common/prisma-errors';

// SharePoint の保存先は UI から入力しないため、新規タブには既定の出力先を補完する。
// 既定タブ（seed.ts）と同じサイト/ドライブを使い、フォルダパスは「スキャナ/タブ名」とする。
// 環境変数で上書き可能。
const DEFAULT_SHAREPOINT_SITE_ID =
  process.env.DEFAULT_SHAREPOINT_SITE_ID ??
  'load1993.sharepoint.com,5399776d-dfbe-4366-92ea-bdd6a29dbbb7,2c10ab4b-5d15-4297-b370-e5de96b96ce4';
const DEFAULT_SHAREPOINT_DRIVE_ID =
  process.env.DEFAULT_SHAREPOINT_DRIVE_ID ??
  'b!bXeZU77fZkOS6r3Wop27t0urECwVXZdCs3Dl3pa5bOQ3xZtxFrJISZvpTn_sroT8';
const DEFAULT_SHAREPOINT_BASE_PATH =
  process.env.DEFAULT_SHAREPOINT_BASE_PATH ?? 'スキャナ';

// 商材ごとのタブを廃止し、すべて 1 画面（既定の 1 設定）で扱うための既定タブ名。
// この 1 タブを裏で使い回し、OCR と SharePoint フォルダ閲覧の基準にする。
const DEFAULT_TAB_NAME = process.env.DEFAULT_TAB_NAME ?? 'AI OCR';

const defaultTabs = [
  {
    name: 'コラボ',
    order: 0,
    isDefault: true,
    isActive: true,
    icon: 'users',
  },
  {
    name: 'リース・現金',
    order: 1,
    isDefault: true,
    isActive: true,
    icon: 'banknote',
  },
  {
    name: 'モバイル',
    order: 2,
    isDefault: true,
    isActive: true,
    icon: 'smartphone',
  },
  {
    name: '電力',
    order: 3,
    isDefault: true,
    isActive: true,
    icon: 'zap',
  },
  {
    name: '経理',
    order: 4,
    isDefault: true,
    isActive: true,
    icon: 'receipt',
  },
] as const;

const legacyDefaultTabNames: Record<string, string[]> = {
  '経理': ['酒井（領収書）', '酒井（領収証）'],
};

@Injectable()
export class TabsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    await this.ensureDefaultTabs();
    return this.prisma.tab.findMany({ orderBy: { order: 'asc' } });
  }

  async findOne(id: string) {
    const tab = await this.prisma.tab.findUnique({ where: { id } });
    if (!tab) throw new NotFoundException('Tab not found');
    return tab;
  }

  // 簡素化後のフロントが使う唯一のタブ。無ければ既定の SharePoint 設定で作成する。
  // フォルダ閲覧のルートが「スキャナ」になるよう folderPath は「スキャナ/AI OCR」とする。
  async getOrCreateDefaultTab() {
    const existing = await this.prisma.tab.findFirst({
      where: { name: DEFAULT_TAB_NAME },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.tab.create({
      data: {
        name: DEFAULT_TAB_NAME,
        order: -1,
        isDefault: true,
        isActive: true,
        icon: 'scan',
        sharepointSiteId: DEFAULT_SHAREPOINT_SITE_ID,
        sharepointDriveId: DEFAULT_SHAREPOINT_DRIVE_ID,
        sharepointFolderPath: `${DEFAULT_SHAREPOINT_BASE_PATH}/AI OCR`,
      },
    });
  }

  create(dto: CreateTabDto) {
    // UI から SharePoint 設定を送らない場合は既定の保存先を補完する。
    // （空のままだとそのタブはアップロード時に保存先エラーになるため）
    return this.prisma.tab.create({
      data: {
        ...dto,
        sharepointSiteId: dto.sharepointSiteId ?? DEFAULT_SHAREPOINT_SITE_ID,
        sharepointDriveId: dto.sharepointDriveId ?? DEFAULT_SHAREPOINT_DRIVE_ID,
        sharepointFolderPath:
          dto.sharepointFolderPath ?? `${DEFAULT_SHAREPOINT_BASE_PATH}/${dto.name}`,
      },
    });
  }

  async update(id: string, dto: UpdateTabDto) {
    await this.findOne(id);
    return this.prisma.tab.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.tab.delete({ where: { id } });
    } catch (error) {
      // 処理済みの書類（uploads）が紐づくタブは外部キー制約で削除できない。
      // 顧客データを巻き込んで消さないよう、分かりやすいメッセージでブロックする。
      if (isForeignKeyConstraintError(error)) {
        throw new ConflictException(
          'このタブには処理済みの書類があるため削除できません。',
        );
      }
      throw error;
    }
  }

  private async ensureDefaultTabs() {
    for (const tab of defaultTabs) {
      const candidateNames = [tab.name, ...(legacyDefaultTabNames[tab.name] ?? [])];
      const existing = await this.prisma.tab.findFirst({
        where: { name: { in: candidateNames } },
      });
      const data = {
        name: tab.name,
        order: tab.order,
        isDefault: true,
        isActive: true,
        icon: tab.icon,
      };

      if (!existing) {
        await this.prisma.tab.create({ data });
        continue;
      }

      await this.prisma.tab.update({
        where: { id: existing.id },
        data,
      });
    }
  }
}
