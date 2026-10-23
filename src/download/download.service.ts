import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import { copyFileSync, existsSync } from 'fs';
import { mkdtemp, readdir, rm, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DownloadEngine } from './dto/download-request.dto';

@Injectable()
export class DownloadService {
  // Render "Secret Files" are mounted under /etc/secrets/<filename>, read-only.
  // Upload a cookies.txt exported from a logged-in YouTube session there
  // (see https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp).
  private static readonly SECRET_COOKIES_PATH =
    process.env.YTDLP_COOKIES_PATH || '/etc/secrets/cookies.txt';

  // yt-dlp rewrites the cookie jar after use (refreshed session tokens), which
  // fails on Render's read-only secret mount. Work from a writable copy instead.
  private static readonly WRITABLE_COOKIES_PATH = join(tmpdir(), 'cookies.txt');

  // Render's IP reputation makes YouTube's bot-check and client-specific
  // quirks unpredictable: a client that works for one request can fail the
  // next. Try the default client, then one fallback. Kept short (not 4+
  // strategies) so a video that fails everywhere still errors out quickly
  // instead of risking a gateway timeout on Render's proxy.
  private static readonly CLIENT_STRATEGIES: (string | undefined)[] = [undefined, 'android'];

  private cookieArgs(): string[] {
    if (!existsSync(DownloadService.SECRET_COOKIES_PATH)) {
      return [];
    }
    // Only seed the writable copy once per container lifetime, so that any
    // session-token refresh yt-dlp writes back persists across requests.
    if (!existsSync(DownloadService.WRITABLE_COOKIES_PATH)) {
      copyFileSync(DownloadService.SECRET_COOKIES_PATH, DownloadService.WRITABLE_COOKIES_PATH);
    }
    return ['--cookies', DownloadService.WRITABLE_COOKIES_PATH];
  }

  private async runYtDlpWithFallback(
    baseArgs: string[],
    onBeforeAttempt?: () => Promise<void>,
  ): Promise<string> {
    let lastError: unknown;
    for (const client of DownloadService.CLIENT_STRATEGIES) {
      const clientArgs = client ? ['--extractor-args', `youtube:player_client=${client}`] : [];
      try {
        await onBeforeAttempt?.();
        return await this.runCommand('yt-dlp', [...baseArgs, ...clientArgs]);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async getInfo(url: string): Promise<unknown> {
    const output = await this.runYtDlpWithFallback([
      '-j',
      '--no-warnings',
      '--skip-download',
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
      // Direct HTTPS adaptive streams are increasingly gated behind a PO token
      // that yt-dlp can't supply; the m3u8/HLS variants of the same formats
      // aren't, so prefer those explicitly.
      await this.runYtDlpWithFallback(
        [
          '-f',
          format ||
            'bestvideo[protocol*=m3u8]+bestaudio[protocol*=m3u8]/best[protocol*=m3u8]/best',
          '--no-playlist',
          '--no-warnings',
          ...this.cookieArgs(),
          '-o',
          outputTemplate,
          url,
        ],
        // A failed attempt can leave partial fragments behind; clear them so
        // the next client's output isn't mistaken for a finished download.
        async () => {
          const leftovers = await readdir(dir);
          await Promise.all(leftovers.map((f) => unlink(join(dir, f))));
        },
      );
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
