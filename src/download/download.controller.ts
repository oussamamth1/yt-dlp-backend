import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { basename } from 'path';
import { DownloadRequestDto } from './dto/download-request.dto';
import { DownloadService } from './download.service';

@Controller()
export class DownloadController {
  constructor(private readonly downloadService: DownloadService) {}

  @Get('info')
  getInfo(@Query('url') url: string) {
    return this.downloadService.getInfo(url);
  }

  @Post('download')
  async download(@Body() body: DownloadRequestDto, @Res() res: Response) {
    const { filePath, cleanup } = await this.downloadService.downloadVideo(body.url, body.format);

    res.download(filePath, basename(filePath), (err) => {
      void cleanup();
      if (err && !res.headersSent) {
        res.status(500).json({ message: 'Failed to send file' });
      }
    });
  }
}
