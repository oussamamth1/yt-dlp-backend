require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (copy .env.example to .env and fill it in)');
    process.exit(1);
  }
  const ca = fs.readFileSync(path.join(__dirname, '..', 'certs', 'supabase-ca.crt'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { ca } });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migration applied successfully.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
