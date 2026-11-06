import { Transform, Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]{1,119}$/u;

export function normalizePhone(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value as string;
  const compact = value.trim().replace(/[\s()-]/g, '');
  return compact === '' ? null : compact;
}

class ContactFieldsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Enter the contact’s full name.' })
  @MaxLength(120, { message: 'Name must be 120 characters or fewer.' })
  @Matches(NAME_PATTERN, {
    message: 'Enter a name using letters, spaces, apostrophes, or hyphens.',
  })
  fullName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email must be 254 characters or fewer.' })
  email!: string;

  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Use a country code, for example +923001234567.',
  })
  phone?: string | null;
}

export class CreateContactDto extends ContactFieldsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  slot?: number;
}

export class UpdateContactDto extends ContactFieldsDto {}
