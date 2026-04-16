import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
      });
    }
  }

  async verifyToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return admin.auth().verifyIdToken(idToken);
  }

  async findOrCreateUser(decoded: admin.auth.DecodedIdToken) {
    return this.prisma.user.upsert({
      where: { firebaseUid: decoded.uid },
      update: { email: decoded.email ?? '' },
      create: {
        firebaseUid: decoded.uid,
        email: decoded.email ?? '',
        displayName: decoded.name ?? null,
      },
    });
  }

  async getOrCreateDevUser() {
    return this.prisma.user.upsert({
      where: { firebaseUid: 'dev-user' },
      update: {},
      create: {
        firebaseUid: 'dev-user',
        email: 'dev@localhost',
        displayName: 'Dev User',
      },
    });
  }
}
