// /lib/db/index.ts
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { pool?: mysql.Pool }

export const pool = globalForDb.pool ?? mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 10,
  // Add these for better connection handling
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
})

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool

export const db = drizzle(pool, { schema, mode: 'default' })

// Add a test connection function
export async function testConnection() {
  try {
    const connection = await pool.getConnection()
    connection.release()
    console.log('Database connected successfully')
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}