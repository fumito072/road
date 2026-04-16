import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NamingRulesService } from './naming-rules.service';
import { CreateNamingRuleDto, UpdateNamingRuleDto } from './naming-rules.dto';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';

@Controller('naming-rules')
@UseGuards(FirebaseAuthGuard)
export class NamingRulesController {
  constructor(private readonly namingRulesService: NamingRulesService) {}

  @Get()
  findAllByTab(@Query('tabId') tabId: string) {
    return this.namingRulesService.findAllByTab(tabId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.namingRulesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateNamingRuleDto) {
    return this.namingRulesService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNamingRuleDto) {
    return this.namingRulesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.namingRulesService.remove(id);
  }
}
