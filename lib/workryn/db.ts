/**
 * Workryn Database Client
 * 
 * Uses Prisma ORM pointed at CaseSync's Supabase Postgres database.
 * The Workryn tables live alongside CaseSync's existing tables.
 * 
 * Unlike the original Workryn which used better-sqlite3, this uses
 * the default Prisma Postgres driver via DATABASE_URL.
 */

import { PrismaClient } from '@prisma/client'

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  workrynPrisma: PrismaClient | undefined
}

export const db = globalForPrisma.workrynPrisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.workrynPrisma = db
