import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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

  // 名簿ファイル（複数・フォルダ可）を受け取り、非同期ジョブを開始してジョブIDを即返す。
  // （OCR+Salesforce照合は数十秒かかるため、同期で待たせずポーリング方式にする）
  @Post('scan')
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  scan(@UploadedFiles() files: UploadedImage[]) {
    return this.memberCheckService.startScan(files);
  }

  // ジョブの状態・結果を取得（フロントが数秒ごとにポーリング）。
  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.memberCheckService.getJob(id);
  }
}
