import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TabsService } from './tabs.service';
import { CreateTabDto, UpdateTabDto } from './tabs.dto';
import { AuthGuard } from '../common/guards/auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('tabs')
@UseGuards(AuthGuard)
export class TabsController {
  constructor(private readonly tabsService: TabsService) {}

  @Get()
  findAll() {
    return this.tabsService.findAll();
  }

  // 簡素化後の単一画面が使う既定タブ。':id' より前に置く必要がある。
  @Get('default')
  getDefault() {
    return this.tabsService.getOrCreateDefaultTab();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tabsService.findOne(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateTabDto) {
    return this.tabsService.create(dto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateTabDto) {
    return this.tabsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.tabsService.remove(id);
  }
}
