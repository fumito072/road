import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OcrModule } from '../ocr/ocr.module';
import { SalesforceModule } from '../salesforce/salesforce.module';
import { MemberCheckController } from './member-check.controller';
import { MemberCheckService } from './member-check.service';

@Module({
  // AuthModule は AuthGuard が必要とする AuthService を供給する（UploadsModule と同じ構成）。
  imports: [AuthModule, OcrModule, SalesforceModule],
  controllers: [MemberCheckController],
  providers: [MemberCheckService],
})
export class MemberCheckModule {}
