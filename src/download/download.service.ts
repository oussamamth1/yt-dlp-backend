import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DownloadEngine } from './dto/download-request.dto';

@Injectable()
export class DownloadService {
  // YouTube's "Sign in to confirm you're not a bot" check targets the default
  // web client on datacenter IPs. The android client skips that challenge
  // for some requests; cookies (below) are the reliable fix for the rest.
  private static readonly YT_DLP_ANTI_BOT_ARGS = [
    '--extractor-args',
    'youtube:player_client=android,web',
  ];

  // Render "Secret Files" are mounted under /etc/secrets/<filename>.
  // Upload a cookies.txt exported from a logged-in YouTube session there
  // (see https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp).
  private static readonly COOKIES_PATH =
    process.env.YTDLP_COOKIES_PATH || '/etc/secrets/cookies.txt';

  private cookieArgs(): string[] {
    return existsSync(DownloadService.COOKIES_PATH)
      ? ['--cookies', DownloadService.COOKIES_PATH]
      : [];
  }

  async getInfo(url: string): Promise<unknown> {
    const output = await this.runCommand('yt-dlp', [
      '-j',
      '--no-warnings',
      '--skip-download',
      ...DownloadService.YT_DLP_ANTI_BOT_ARGS,
      ...this.cookieArgs(),
      url,
    ]);
    try {
      return JSON.parse(output);
    } catch {
      throw new InternalServerErrorException('Failed to parse video info');
    }
  }

  async downloadVideo(
    url: string,
    format?: string,
    engine: DownloadEngine = 'yt-dlp',
  ): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), 'download-'));

    if (engine === 'you-get') {
      await this.runCommand('you-get', ['-o', dir, '--no-caption', url]);
    } else {
      const outputTemplate = join(dir, '%(title).80s.%(ext)s');
      await this.runCommand('yt-dlp', [
        '-f',
        format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--no-playlist',
        '--no-warnings',
        ...DownloadService.YT_DLP_ANTI_BOT_ARGS,
        ...this.cookieArgs(),
        '-o',
        outputTemplate,
        url,
      ]);
    }

    const files = await readdir(dir);
    if (files.length === 0) {
      await rm(dir, { recursive: true, force: true });
      throw new NotFoundException('Download produced no file');
    }

    const filePath = join(dir, files[0]);
    return {
      filePath,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => (stdout += chunk));
      proc.stderr.on('data', (chunk) => (stderr += chunk));

      proc.on('error', (err) => reject(new InternalServerErrorException(err.message)));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new InternalServerErrorException(
              stderr.trim() || `${command} exited with code ${code}`,
            ),
          );
        }
      });
    });
  }
}
