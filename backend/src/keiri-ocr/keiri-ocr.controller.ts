import {
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../common/guards/auth.guard';
import { KeiriOcrService } from './keiri-ocr.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('keiri-ocr')
@UseGuards(AuthGuard)
export class KeiriOcrController {
  constructor(private readonly keiriOcrService: KeiriOcrService) {}

  // 領収書・請求書を受け取り、会社名・金額・取引日を抽出して命名候補を返す。
  @Post('scan')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  scan(@UploadedFiles() files: UploadedImage[]) {
    return this.keiriOcrService.scan(files);
  }
}
