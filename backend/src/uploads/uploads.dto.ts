import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadFileDto {
  @IsString()
  originalFileName!: string;

  @IsString()
  mimeType!: string;

  sizeBytes!: number;

  @IsString()
  storagePath!: string;
}

export class CreateUploadDto {
  @IsString()
  tabId!: string;

  @IsString()
  folderName!: string;

  @IsString()
  @IsOptional()
  contractNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadFileDto)
  files!: UploadFileDto[];
}

export class ConfirmUploadDto {
  @IsString()
  @IsOptional()
  contractNumber?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerKana?: string;

  @IsString()
  @IsOptional()
  applicationNumber?: string;

  @IsString()
  @IsOptional()
  sharepointFolderPath?: string;

  @IsOptional()
  ocrStructuredResult?: Record<string, unknown>;
}

export class ResolveUploadDto {
  @IsString()
  customerName!: string;

  @IsString()
  @IsOptional()
  customerKana?: string;
}

export class IntakeUploadDto {
  @IsString()
  tabId!: string;

  @IsString()
  folderName!: string;

  @IsString()
  @IsOptional()
  contractNumber?: string;
}
