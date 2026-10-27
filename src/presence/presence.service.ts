import { Injectable } from '@nestjs/common';

/** Tracks which usernames currently have a live socket connection. In-memory, single-instance only — fine for this scale. */
@Injectable()
export class PresenceService {
  private readonly online = new Set<string>();

  markOnline(username: string): void {
    this.online.add(username.toLowerCase());
  }

  markOffline(username: string): void {
    this.online.delete(username.toLowerCase());
  }

  isOnline(username: string): boolean {
    return this.online.has(username.toLowerCase());
  }
}
