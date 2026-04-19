import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Explicit local-dev bypass. Must be enabled deliberately via env var —
    // NODE_ENV alone is not enough, to prevent prod from accidentally running
    // unauthenticated.
    if (this.config.get<string>('AUTH_ALLOW_DEV_USER') === 'true') {
      (request as any).user = await this.authService.getOrCreateDevUser();
      return true;
    }

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const user = await this.authService.verifyToken(header.slice(7));
    (request as any).user = user;
    return true;
  }
}
