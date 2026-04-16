import { Module } from '@nestjs/common';
import { TabsController } from './tabs.controller';
import { TabsService } from './tabs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TabsController],
  providers: [TabsService],
  exports: [TabsService],
})
export class TabsModule {}
