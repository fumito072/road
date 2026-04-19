import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: SessionUser }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return {
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }

  async verifyToken(token: string): Promise<SessionUser> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('ユーザーが見つかりません');
      }
      return { id: user.id, email: user.email, displayName: user.displayName };
    } catch {
      throw new UnauthorizedException('セッションの有効期限が切れました。再度サインインしてください。');
    }
  }

  async getOrCreateDevUser(): Promise<SessionUser> {
    const user = await this.prisma.user.upsert({
      where: { email: 'dev@localhost' },
      update: {},
      create: {
        email: 'dev@localhost',
        displayName: 'Dev User',
      },
    });
    return { id: user.id, email: user.email, displayName: user.displayName };
  }
}
