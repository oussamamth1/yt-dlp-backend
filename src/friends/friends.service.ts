import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { UsersService } from '../auth/users.service';
import { PG_POOL } from '../database/database.module';
import { withRetry } from '../database/with-retry';

export interface IncomingRequest {
  id: string;
  from: string;
  createdAt: string;
}

@Injectable()
export class FriendsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly users: UsersService,
  ) {}

  async sendRequest(me: string, target: string): Promise<void> {
    const meLower = me.toLowerCase();
    const targetLower = target.toLowerCase();
    if (meLower === targetLower) {
      throw new BadRequestException("You can't add yourself");
    }
    if (!(await this.users.find(targetLower))) {
      throw new NotFoundException('User not found');
    }

    const existing = await withRetry(() =>
      this.pool.query<{ status: string }>(
        `select status from friend_requests
         where (requester = $1 and recipient = $2) or (requester = $2 and recipient = $1)`,
        [meLower, targetLower],
      ),
    );
    if (existing.rows.length) {
      throw new ConflictException(
        existing.rows[0].status === 'accepted' ? 'Already friends' : 'Request already pending',
      );
    }

    await withRetry(() =>
      this.pool.query('insert into friend_requests (requester, recipient) values ($1, $2)', [
        meLower,
        targetLower,
      ]),
    );
  }

  async incoming(me: string): Promise<IncomingRequest[]> {
    const result = await withRetry(() =>
      this.pool.query<{ id: string; requester: string; created_at: Date }>(
        `select id, requester, created_at from friend_requests
         where recipient = $1 and status = 'pending'
         order by created_at desc`,
        [me.toLowerCase()],
      ),
    );
    return result.rows.map((row) => ({
      id: row.id,
      from: row.requester,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async accept(me: string, id: string): Promise<void> {
    const result = await withRetry(() =>
      this.pool.query(
        `update friend_requests set status = 'accepted'
         where id = $1 and recipient = $2 and status = 'pending'
         returning id`,
        [id, me.toLowerCase()],
      ),
    );
    if (!result.rows.length) {
      throw new NotFoundException('Request not found');
    }
  }

  async decline(me: string, id: string): Promise<void> {
    const result = await withRetry(() =>
      this.pool.query(
        `delete from friend_requests where id = $1 and recipient = $2 and status = 'pending' returning id`,
        [id, me.toLowerCase()],
      ),
    );
    if (!result.rows.length) {
      throw new NotFoundException('Request not found');
    }
  }

  async listFriends(me: string): Promise<string[]> {
    const meLower = me.toLowerCase();
    const result = await withRetry(() =>
      this.pool.query<{ friend: string }>(
        `select case when requester = $1 then recipient else requester end as friend
         from friend_requests
         where status = 'accepted' and (requester = $1 or recipient = $1)
         order by friend`,
        [meLower],
      ),
    );
    return result.rows.map((row) => row.friend);
  }
}
