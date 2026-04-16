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
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';

@Controller('tabs')
@UseGuards(FirebaseAuthGuard)
export class TabsController {
  constructor(private readonly tabsService: TabsService) {}

  @Get()
  findAll() {
    return this.tabsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tabsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTabDto) {
    return this.tabsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTabDto) {
    return this.tabsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tabsService.remove(id);
  }
}
