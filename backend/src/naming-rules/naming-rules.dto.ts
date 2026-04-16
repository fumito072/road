import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateNamingRuleDto {
  @IsString()
  tabId!: string;

  @IsString()
  documentType!: string;

  @IsString()
  pattern!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  priority?: number;
}

export class UpdateNamingRuleDto {
  @IsString()
  @IsOptional()
  documentType?: string;

  @IsString()
  @IsOptional()
  pattern?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  priority?: number;
}
