import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';

@Module({
  providers: [AuthService, FirebaseAuthGuard],
  exports: [AuthService, FirebaseAuthGuard],
})
export class AuthModule {}
