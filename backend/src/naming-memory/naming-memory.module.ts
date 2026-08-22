import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NamingMemoryController } from './naming-memory.controller';
import { NamingMemoryService } from './naming-memory.service';

@Module({
  imports: [AuthModule],
  controllers: [NamingMemoryController],
  providers: [NamingMemoryService],
  exports: [NamingMemoryService],
})
export class NamingMemoryModule {}
