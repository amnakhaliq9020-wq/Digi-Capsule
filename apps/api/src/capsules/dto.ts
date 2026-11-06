import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CapsuleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Enter a capsule title.' })
  @MaxLength(120, { message: 'Title must be 120 characters or fewer.' })
  title!: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be 2,000 characters or fewer.' })
  description?: string | null;
}
