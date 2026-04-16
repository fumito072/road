import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNamingRuleDto, UpdateNamingRuleDto } from './naming-rules.dto';

@Injectable()
export class NamingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllByTab(tabId: string) {
    return this.prisma.namingRule.findMany({
      where: { tabId },
      orderBy: { priority: 'asc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.namingRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Naming rule not found');
    return rule;
  }

  create(dto: CreateNamingRuleDto) {
    return this.prisma.namingRule.create({ data: dto });
  }

  async update(id: string, dto: UpdateNamingRuleDto) {
    await this.findOne(id);
    return this.prisma.namingRule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.namingRule.delete({ where: { id } });
  }
}
