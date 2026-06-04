import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './users.dto';

// パスワードハッシュなど秘匿情報を返さないための公開用フィールド
const publicSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: publicSelect,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('このメールアドレスは既に登録されています');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName?.trim() || null,
        role: dto.role === 'ADMIN' ? 'ADMIN' : 'USER',
      },
      select: publicSelect,
    });
  }

  async remove(id: string, requesterId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('ユーザーが見つかりません');
    }
    if (user.id === requesterId) {
      throw new BadRequestException('自分自身は削除できません');
    }
    // 管理者が0人になるのを防ぐ（ログインできなくなるため）
    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new BadRequestException(
          '管理者が0人になるため、この管理者は削除できません',
        );
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
