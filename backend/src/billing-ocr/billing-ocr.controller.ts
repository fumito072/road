import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../common/guards/auth.guard';
import { BillingOcrService } from './billing-ocr.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('billing-ocr')
@UseGuards(AuthGuard)
export class BillingOcrController {
  constructor(private readonly billingOcrService: BillingOcrService) {}

  // 請求明細を受け取り、顧客名・明細の種類・キャリア名・日付を抽出して命名候補を返す。
  // tabId は学習辞書（過去の修正内容）を引くために使う。未指定でも読み取りは動く。
  @Post('scan')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  scan(@UploadedFiles() files: UploadedImage[], @Body('tabId') tabId?: string) {
    return this.billingOcrService.scan(files, tabId);
  }
}
