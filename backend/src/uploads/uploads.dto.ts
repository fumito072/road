import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
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
  contractNumber?: string;

  @IsString()
  @IsOptional()
  applicationNumber?: string;

  @IsString()
  @IsOptional()
  customerKana?: string;

  @IsString()
  @IsOptional()
  destinationCustomerName?: string;

  @IsIn(['existing', 'new'])
  @IsOptional()
  destinationMode?: 'existing' | 'new';

  @IsString()
  @IsOptional()
  destinationFolderName?: string;
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

export class SaveFileNameResultDto {
  @IsString()
  originalFileName!: string;

  @IsString()
  outputFileName!: string;

  @IsString()
  @IsOptional()
  documentType?: string;

  @IsString()
  @IsOptional()
  documentDate?: string;
}

export class SaveFileNamesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaveFileNameResultDto)
  fileResults!: SaveFileNameResultDto[];

  @IsString()
  @IsOptional()
  fileCustomerName?: string;

  @IsString()
  @IsOptional()
  fileDate?: string;
}
