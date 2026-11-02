import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
export class EmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
}
export class RegisterDto extends EmailDto {
  @IsString() @MinLength(12) @MaxLength(128) password: string;
}
export class LoginDto extends EmailDto {
  @IsString() @MinLength(1) @MaxLength(128) password: string;
}
export class TokenDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token: string;
}
export class ResetDto extends TokenDto {
  @IsString() @MinLength(12) @MaxLength(128) password: string;
}
export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(12) @MaxLength(128) password: string;
}
