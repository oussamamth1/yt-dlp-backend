import { IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,20}$/, {
    message: 'username must be 3-20 characters, letters/numbers/underscore only',
  })
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
