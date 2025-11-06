/**
 * Singleton Prisma Client for optimal connection pooling
 * Prevents creating multiple database connections
 */

import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Reuse existing client in development (prevents hot reload issues)
// Create new client in production
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  // Connection pool configuration for high performance
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Store in global for development hot reloading
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Graceful shutdown
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

export default prisma;