import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';

export class CreateTabDto {
  @IsString()
  name!: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  ocrPromptTemplate?: string;

  @IsString()
  @IsOptional()
  workflowPromptTemplate?: string;

  @IsString()
  @IsOptional()
  sharepointSiteId?: string;

  @IsString()
  @IsOptional()
  sharepointDriveId?: string;

  @IsString()
  @IsOptional()
  sharepointFolderPath?: string;
}

export class UpdateTabDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  ocrPromptTemplate?: string;

  @IsString()
  @IsOptional()
  workflowPromptTemplate?: string;

  @IsString()
  @IsOptional()
  sharepointSiteId?: string;

  @IsString()
  @IsOptional()
  sharepointDriveId?: string;

  @IsString()
  @IsOptional()
  sharepointFolderPath?: string;
}
