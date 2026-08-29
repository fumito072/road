import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OcrModule } from '../ocr/ocr.module';
import { NamingMemoryModule } from '../naming-memory/naming-memory.module';
import { BillingOcrController } from './billing-ocr.controller';
import { BillingOcrService } from './billing-ocr.service';

@Module({
  imports: [AuthModule, OcrModule, NamingMemoryModule],
  controllers: [BillingOcrController],
  providers: [BillingOcrService],
})
export class BillingOcrModule {}
