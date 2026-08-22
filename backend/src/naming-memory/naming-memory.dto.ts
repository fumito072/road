import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, ValidateNested } from 'class-validator';

export class NamingMemoryEntryDto {
  /** OCR が読んだ生の値。辞書適用後の値を送ってはいけない。 */
  @IsString()
  ocrValue!: string;

  /** ユーザーが保存時に確定した値。 */
  @IsString()
  confirmedValue!: string;
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
