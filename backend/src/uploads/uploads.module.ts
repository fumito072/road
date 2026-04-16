import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { OcrModule } from '../ocr/ocr.module';
import { SharepointModule } from '../sharepoint/sharepoint.module';
import { AuthModule } from '../auth/auth.module';
import { NamingRulesModule } from '../naming-rules/naming-rules.module';

@Module({
  imports: [AuthModule, OcrModule, SharepointModule, NamingRulesModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
