import { Module } from '@nestjs/common';
import { NamingRulesController } from './naming-rules.controller';
import { NamingRulesService } from './naming-rules.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NamingRulesController],
  providers: [NamingRulesService],
  exports: [NamingRulesService],
})
export class NamingRulesModule {}
