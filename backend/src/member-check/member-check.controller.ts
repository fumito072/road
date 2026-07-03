import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../common/guards/auth.guard';
import { MemberCheckService } from './member-check.service';

type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('member-check')
@UseGuards(AuthGuard)
export class MemberCheckController {
  constructor(private readonly memberCheckService: MemberCheckService) {}

  // 名簿画像を1枚受け取り、OCR抽出 → Salesforce照合した結果を返す。
  @Post('scan')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  scan(@UploadedFile() file: UploadedImage) {
    return this.memberCheckService.scanRoster(file);
  }
}
