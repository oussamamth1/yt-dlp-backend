import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { withRetry } from '../database/with-retry';
import { conversationId } from './conversation-id';

export type MessageType = 'text' | 'image' | 'voice';

export interface StoredMessage {
  id: string;
  conversationId: string;
  from: string;
  // Server only ever sees/stores ciphertext; it cannot read the content
  // without the shared code the clients hold. For image/voice messages this
  // is the base64 ciphertext of the encrypted media bytes.
  ciphertext: string;
  type: MessageType;
  createdAt: string;
  readAt: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender: string;
  ciphertext: string;
  type: MessageType;
  created_at: Date;
  read_at: Date | null;
}

@Injectable()
export class ChatService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async addMessage(
    from: string,
    to: string,
    ciphertext: string,
    type: MessageType = 'text',
  ): Promise<StoredMessage> {
    const id = conversationId(from, to);
    const result = await withRetry(() =>
      this.pool.query<MessageRow>(
        `insert into messages (conversation_id, sender, ciphertext, type)
         values ($1, $2, $3, $4)
         returning id, conversation_id, sender, ciphertext, type, created_at, read_at`,
        [id, from, ciphertext, type],
      ),
    );
    return this.toStoredMessage(result.rows[0]);
  }

  async getHistory(userA: string, userB: string): Promise<StoredMessage[]> {
    const result = await withRetry(() =>
      this.pool.query<MessageRow>(
        `select id, conversation_id, sender, ciphertext, type, created_at, read_at
         from messages
         where conversation_id = $1
         order by created_at asc`,
        [conversationId(userA, userB)],
      ),
    );
    return result.rows.map((row) => this.toStoredMessage(row));
  }

  /** Marks every unread message from `otherUsername` to `me` as read. Returns the ids that flipped. */
  async markRead(me: string, otherUsername: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.pool.query<{ id: string }>(
        `update messages set read_at = now()
         where conversation_id = $1 and sender = $2 and read_at is null
         returning id`,
        [conversationId(me, otherUsername), otherUsername.toLowerCase()],
      ),
    );
    return result.rows.map((row) => row.id);
  }

  /** Unread message counts per sender, across every conversation `me` is part of. */
  async getUnreadCounts(me: string): Promise<{ otherUsername: string; count: number }[]> {
    const username = me.toLowerCase();
    const result = await withRetry(() =>
      this.pool.query<{ otherUsername: string; count: number }>(
        `select sender as "otherUsername", count(*)::int as count
         from messages
         where read_at is null and sender <> $1
           and (conversation_id like $1 || '::%' or conversation_id like '%::' || $1)
         group by sender`,
        [username],
      ),
    );
    return result.rows;
  }

  private toStoredMessage(row: MessageRow): StoredMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      from: row.sender,
      ciphertext: row.ciphertext,
      type: row.type,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at ? row.read_at.toISOString() : null,
    };
  }
}
