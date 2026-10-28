import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withRetry } from '../database/with-retry';

export interface User {
  username: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async find(username: string): Promise<User | undefined> {
    const result = await withRetry(() =>
      this.pool.query<{ username: string; password_hash: string }>(
        'select username, password_hash from users where username = $1',
        [username.toLowerCase()],
      ),
    );
    const row = result.rows[0];
    return row ? { username: row.username, passwordHash: row.password_hash } : undefined;
  }

  async create(user: User): Promise<void> {
    await withRetry(() =>
      this.pool.query('insert into users (username, password_hash) values ($1, $2)', [
        user.username.toLowerCase(),
        user.passwordHash,
      ]),
    );
  }

  async search(query: string, excluding: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.pool.query<{ username: string }>(
        `select username from users where username ilike $1 and username <> $2 order by username limit 20`,
        [`%${query}%`, excluding.toLowerCase()],
      ),
    );
    return result.rows.map((row) => row.username);
  }

  async getStatus(username: string): Promise<string> {
    const result = await withRetry(() =>
      this.pool.query<{ status: string }>('select status from users where username = $1', [
        username.toLowerCase(),
      ]),
    );
    return result.rows[0]?.status ?? '';
  }

  async updateStatus(username: string, status: string): Promise<void> {
    await withRetry(() =>
      this.pool.query('update users set status = $1 where username = $2', [
        status,
        username.toLowerCase(),
      ]),
    );
  }

  async updateFcmToken(username: string, token: string): Promise<void> {
    await withRetry(() =>
      this.pool.query('update users set fcm_token = $1 where username = $2', [
        token,
        username.toLowerCase(),
      ]),
    );
  }

  async getFcmToken(username: string): Promise<string | undefined> {
    const result = await withRetry(() =>
      this.pool.query<{ fcm_token: string | null }>('select fcm_token from users where username = $1', [
        username.toLowerCase(),
      ]),
    );
    return result.rows[0]?.fcm_token ?? undefined;
  }
}
