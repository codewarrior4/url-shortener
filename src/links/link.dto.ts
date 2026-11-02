import { IsString, IsUrl, MaxLength } from 'class-validator';
import {
  destinationUrlOptions,
  MAX_DESTINATION_LENGTH,
} from './destination-url.js';

export class CreateLinkDto {
  @IsString()
  @MaxLength(MAX_DESTINATION_LENGTH)
  @IsUrl(destinationUrlOptions)
  destination: string;
}

// Destination is currently the only editable field, so it is required on PATCH.
export class UpdateLinkDto extends CreateLinkDto {}
