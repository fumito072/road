import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UploadsService } from './uploads.service';
import { CreateUploadDto, ConfirmUploadDto, IntakeUploadDto, ResolveUploadDto } from './uploads.dto';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('uploads')
@UseGuards(FirebaseAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get()
  findAll(
    @Query('tabId') tabId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.uploadsService.findAllByTab(tabId, user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.uploadsService.findOne(id, user.id);
  }

  @Post()
  create(
    @Body() dto: CreateUploadDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.uploadsService.create(dto, user.id);
  }

  @Post('intake')
  @UseInterceptors(FilesInterceptor('files', 50))
  intake(
    @UploadedFiles() files: UploadedFile[],
    @Body() dto: IntakeUploadDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.uploadsService.createFromUploadedFiles(dto, files, user.id);
  }

  @Post(':id/ocr')
  runOcr(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.uploadsService.runOcr(id, user.id);
  }

  @Post(':id/resolve')
  resolveDestination(
    @Param('id') id: string,
    @Body() dto: ResolveUploadDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.uploadsService.resolveDestination(id, user.id, dto);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.uploadsService.confirm(id, user.id, dto);
  }

  @Post(':id/sharepoint')
  sendToSharepoint(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.uploadsService.sendToSharepoint(id, user.id);
  }

  @Get(':id/files/:fileId/preview')
  async previewFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: { id: string },
    @Res() res: Response,
  ) {
    const { buffer, mimeType, fileName } = await this.uploadsService.loadFileForPreview(
      id,
      fileId,
      user.id,
    );

    if (!buffer) {
      throw new NotFoundException('File not available');
    }

    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }
}
