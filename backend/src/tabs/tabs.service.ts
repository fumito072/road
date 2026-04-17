import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTabDto, UpdateTabDto } from './tabs.dto';

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
    name: '電力',
    order: 2,
    isDefault: true,
    isActive: true,
    icon: 'zap',
  },
  {
    name: 'モバイル',
    order: 3,
    isDefault: true,
    isActive: true,
    icon: 'smartphone',
  },
  {
    name: '酒井（領収書）',
    order: 4,
    isDefault: true,
    isActive: true,
    icon: 'receipt',
  },
] as const;

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

  create(dto: CreateTabDto) {
    return this.prisma.tab.create({ data: dto });
  }

  async update(id: string, dto: UpdateTabDto) {
    await this.findOne(id);
    return this.prisma.tab.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tab.delete({ where: { id } });
  }

  private async ensureDefaultTabs() {
    for (const tab of defaultTabs) {
      const existing = await this.prisma.tab.findFirst({
        where: { name: tab.name },
      });

      if (!existing) {
        await this.prisma.tab.create({ data: tab });
        continue;
      }

      await this.prisma.tab.update({
        where: { id: existing.id },
        data: {
          order: tab.order,
          isDefault: true,
          isActive: true,
          icon: tab.icon,
        },
      });
    }
  }
}
