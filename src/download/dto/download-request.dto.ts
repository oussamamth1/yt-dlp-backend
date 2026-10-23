import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export type DownloadEngine = 'yt-dlp' | 'you-get';

export class DownloadRequestDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsIn(['yt-dlp', 'you-get'])
  engine?: DownloadEngine;
}
