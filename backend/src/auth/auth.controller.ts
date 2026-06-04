import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class LoginDto {
  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'パスワードを入力してください' })
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: '現在のパスワードを入力してください' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: '新しいパスワードは8文字以上で設定してください' })
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: { id: string; email: string; displayName: string | null; role: 'USER' | 'ADMIN' }) {
    return { user };
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
