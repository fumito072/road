import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SHAREPOINT_SITE_ID = 'load1993.sharepoint.com,5399776d-dfbe-4366-92ea-bdd6a29dbbb7,2c10ab4b-5d15-4297-b370-e5de96b96ce4';
const SHAREPOINT_DRIVE_ID = 'b!bXeZU77fZkOS6r3Wop27t0urECwVXZdCs3Dl3pa5bOQ3xZtxFrJISZvpTn_sroT8';

const defaultTabs = [
  {
    name: 'モバイル',
    order: 0,
    isDefault: true,
    isActive: true,
    icon: 'smartphone',
    sharepointSiteId: SHAREPOINT_SITE_ID,
    sharepointDriveId: SHAREPOINT_DRIVE_ID,
    sharepointFolderPath: 'スキャナ/モバイル',
  },
  {
    name: '電力',
    order: 1,
    isDefault: true,
    isActive: true,
    icon: 'zap',
    sharepointSiteId: SHAREPOINT_SITE_ID,
    sharepointDriveId: SHAREPOINT_DRIVE_ID,
    sharepointFolderPath: 'スキャナ/電力',
  },
  {
    name: 'リース・現金',
    order: 2,
    isDefault: true,
    isActive: true,
    icon: 'banknote',
    sharepointSiteId: SHAREPOINT_SITE_ID,
    sharepointDriveId: SHAREPOINT_DRIVE_ID,
    sharepointFolderPath: 'スキャナ/リース・現金',
  },
  {
    name: 'コラボ',
    order: 3,
    isDefault: true,
    isActive: true,
    icon: 'users',
    sharepointSiteId: SHAREPOINT_SITE_ID,
    sharepointDriveId: SHAREPOINT_DRIVE_ID,
    sharepointFolderPath: 'スキャナ/コラボ',
  },
  {
    name: '酒井（領収書）',
    order: 4,
    isDefault: true,
    isActive: true,
    icon: 'receipt',
    sharepointSiteId: SHAREPOINT_SITE_ID,
    sharepointDriveId: SHAREPOINT_DRIVE_ID,
    sharepointFolderPath: 'スキャナ/酒井（領収証）',
  },
];

async function main() {
  console.log('Seeding default tabs...');

  for (const tab of defaultTabs) {
    const existing = await prisma.tab.findFirst({
      where: { name: tab.name, isDefault: true },
    });

    if (!existing) {
      await prisma.tab.create({ data: tab });
      console.log(`  Created: ${tab.name}`);
    } else {
      await prisma.tab.update({
        where: { id: existing.id },
        data: {
          order: tab.order,
          isDefault: true,
          isActive: true,
          icon: tab.icon,
          sharepointSiteId: tab.sharepointSiteId,
          sharepointDriveId: tab.sharepointDriveId,
          sharepointFolderPath: tab.sharepointFolderPath,
        },
      });
      console.log(`  Skipped (exists): ${tab.name}`);
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
