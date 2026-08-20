import 'dotenv/config'
import mysql from 'mysql2/promise'
import { readFile } from 'node:fs/promises'

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL || 'mysql://root:password@127.0.0.1:3306/reachinbox')
  const sql = await readFile(new URL('../lib/db/schema.sql', import.meta.url), 'utf8')
  for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) await connection.query(statement)
  await connection.end()
  console.log('MySQL schema initialized')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
