import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TabsModule } from './tabs/tabs.module';
import { UploadsModule } from './uploads/uploads.module';
import { OcrModule } from './ocr/ocr.module';
import { SharepointModule } from './sharepoint/sharepoint.module';
import { NamingRulesModule } from './naming-rules/naming-rules.module';
import { MemberCheckModule } from './member-check/member-check.module';
import { KeiriOcrModule } from './keiri-ocr/keiri-ocr.module';
import { NamingMemoryModule } from './naming-memory/naming-memory.module';
import { BillingOcrModule } from './billing-ocr/billing-ocr.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TabsModule,
    UploadsModule,
    OcrModule,
    SharepointModule,
    NamingRulesModule,
    MemberCheckModule,
    KeiriOcrModule,
    NamingMemoryModule,
    BillingOcrModule,
  ],
})
export class AppModule {}
