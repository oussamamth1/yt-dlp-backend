import { IsString, MaxLength } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsString()
  @MaxLength(4096)
  token: string;
}
