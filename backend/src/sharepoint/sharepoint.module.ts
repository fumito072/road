import { Module } from '@nestjs/common';
import { SharepointService } from './sharepoint.service';

@Module({
  providers: [SharepointService],
  exports: [SharepointService],
})
export class SharepointModule {}
