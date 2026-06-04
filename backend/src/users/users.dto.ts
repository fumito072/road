import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上で設定してください' })
  password!: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsIn(['USER', 'ADMIN'], { message: '権限は USER または ADMIN を指定してください' })
  @IsOptional()
  role?: 'USER' | 'ADMIN';
}
