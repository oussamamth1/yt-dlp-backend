import { IsOptional, IsString, IsUrl } from 'class-validator';

export class DownloadRequestDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  format?: string;
}
