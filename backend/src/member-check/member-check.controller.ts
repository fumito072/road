import {
  Controller,
  Get,
  Param,
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

  // 名簿画像を1枚受け取り、非同期ジョブを開始してジョブIDを即返す。
  // （OCR+Salesforce照合は数十秒かかるため、同期で待たせずポーリング方式にする）
  @Post('scan')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  scan(@UploadedFile() file: UploadedImage) {
    return this.memberCheckService.startScan(file);
  }

  // ジョブの状態・結果を取得（フロントが数秒ごとにポーリング）。
  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.memberCheckService.getJob(id);
  }
}
