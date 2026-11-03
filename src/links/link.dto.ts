import {
  IsBoolean,
  IsISO8601,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ALIAS_PATTERN } from './alias-policy.js';
import {
  destinationUrlOptions,
  MAX_DESTINATION_LENGTH,
} from './destination-url.js';

class LinkLifecycleDto {
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: 'expiresAt must include a timezone',
  })
  expiresAt?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isEnabled?: boolean;
}

export class CreateLinkDto extends LinkLifecycleDto {
  @IsString()
  @MaxLength(MAX_DESTINATION_LENGTH)
  @IsUrl(destinationUrlOptions)
  destination: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(ALIAS_PATTERN, {
    message: 'alias must contain 3–32 letters, numbers, hyphens or underscores',
  })
  alias?: string;
}

export class UpdateLinkDto extends LinkLifecycleDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(MAX_DESTINATION_LENGTH)
  @IsUrl(destinationUrlOptions)
  destination?: string;
}
