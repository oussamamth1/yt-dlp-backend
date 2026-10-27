import { Global, Module } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

// Supabase signs Postgres TLS certs with its own private root CA (not a
// public one like Let's Encrypt), so we pin and verify against it explicitly
// rather than disabling certificate verification.
const SUPABASE_CA = readFileSync(join(__dirname, '..', '..', 'certs', 'supabase-ca.crt'));

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        if (!process.env.DATABASE_URL) {
          throw new Error('DATABASE_URL is not set (see .env.example)');
        }
        return new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { ca: SUPABASE_CA },
          // Supabase's shared pooler load-balances across several backend
          // IPs; some are occasionally unreachable from a given network path
          // while others work fine. Fail fast and let the pool retry on the
          // next query rather than hanging on a single bad IP for ~20s+.
          connectionTimeoutMillis: 4000,
          max: 5,
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
