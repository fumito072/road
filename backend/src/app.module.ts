import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TabsModule } from './tabs/tabs.module';
import { UploadsModule } from './uploads/uploads.module';
import { OcrModule } from './ocr/ocr.module';
import { SharepointModule } from './sharepoint/sharepoint.module';
import { NamingRulesModule } from './naming-rules/naming-rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TabsModule,
    UploadsModule,
    OcrModule,
    SharepointModule,
    NamingRulesModule,
  ],
})
export class AppModule {}
