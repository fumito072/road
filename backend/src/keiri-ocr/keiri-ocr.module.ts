import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OcrModule } from '../ocr/ocr.module';
import { NamingMemoryModule } from '../naming-memory/naming-memory.module';
import { KeiriOcrController } from './keiri-ocr.controller';
import { KeiriOcrService } from './keiri-ocr.service';

@Module({
  imports: [AuthModule, OcrModule, NamingMemoryModule],
  controllers: [KeiriOcrController],
  providers: [KeiriOcrService],
})
export class KeiriOcrModule {}
