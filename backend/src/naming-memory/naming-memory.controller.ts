import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NamingMemoryService } from './naming-memory.service';
import { RecordNamingMemoryDto } from './naming-memory.dto';

@Controller('naming-memory')
@UseGuards(AuthGuard)
export class NamingMemoryController {
  constructor(private readonly namingMemoryService: NamingMemoryService) {}

  @Get()
  list(@Query('tabId') tabId: string, @Query('field') field?: string) {
    return this.namingMemoryService.list(tabId, field);
  }

  // 「ファイル名へ反映」押下時に呼ばれる。ユーザーが直した表記を次回以降に引き継ぐ。
  @Post('record')
  record(
    @Body() dto: RecordNamingMemoryDto,
    @CurrentUser() user: { email?: string },
  ) {
    return this.namingMemoryService.record(dto.tabId, dto.entries, user?.email ?? null);
  }

  // 誤学習の取り消し。管理者のみ。
  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.namingMemoryService.remove(id);
  }
}
