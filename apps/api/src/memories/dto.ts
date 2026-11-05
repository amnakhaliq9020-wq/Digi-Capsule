import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MemoryType } from '@prisma/client';

function trimToNull(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class MemoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Enter a memory title.' })
  @MaxLength(160, { message: 'Title must be 160 characters or fewer.' })
  title!: string;

  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be 2,000 characters or fewer.' })
  description?: string | null;

  @IsEnum(MemoryType, { message: 'Choose a memory type.' })
  type!: MemoryType;

  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\0/g, '').trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100000, { message: 'The letter must be 100,000 characters or fewer.' })
  body?: string | null;

  @Transform(({ value }) => (Array.isArray(value) ? value.map((tag) => String(tag).trim()).filter(Boolean) : value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Use up to 10 tags.' })
  @IsString({ each: true })
  @MaxLength(30, { each: true, message: 'Each tag must be 30 characters or fewer.' })
  tags?: string[];

  @IsString()
  @MinLength(1)
  capsuleId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'A memory can include up to 12 files.' })
  @IsString({ each: true })
  assetIds?: string[];
}
