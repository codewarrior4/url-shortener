import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateLinkDto {
  @IsString()
  @MaxLength(2048)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    disallow_auth: true,
  })
  destination: string;
}

// Destination is currently the only editable field, so it is required on PATCH.
export class UpdateLinkDto extends CreateLinkDto {}
