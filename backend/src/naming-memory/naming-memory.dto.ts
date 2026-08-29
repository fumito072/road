import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { NAMING_MEMORY_FIELDS } from './naming-memory.service';

export class NamingMemoryEntryDto {
  /** OCR が読んだ生の値。辞書適用後の値を送ってはいけない。 */
  @IsString()
  ocrValue!: string;

  /** ユーザーが確定した値。 */
  @IsString()
  confirmedValue!: string;

  /** 学習対象の項目（company / documentType / carrier）。未指定なら company。 */
  @IsIn(NAMING_MEMORY_FIELDS)
  @IsOptional()
  field?: string;
}

export class RecordNamingMemoryDto {
  @IsString()
  tabId!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NamingMemoryEntryDto)
  entries!: NamingMemoryEntryDto[];
}
