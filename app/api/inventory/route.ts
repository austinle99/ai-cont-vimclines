import { NextResponse } from 'next/server';
import { redisCache, generateCacheKey } from '@/lib/cache/redisCache';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json([]);
    }

    // Try Redis cache first (TTL: 180 seconds = 3 minutes)
    const cacheKey = generateCacheKey('inventory', {});
    let inventory = await redisCache.get<any>(cacheKey);

    if (!inventory) {
      // Dynamic import to avoid build-time issues
      const { prisma } = await import('@/lib/db');

      inventory = await prisma.inventory.findMany({
        orderBy: [{ port: "asc" }, { type: "asc" }]
      });

      // Cache for 3 minutes
      if (inventory) {
        await redisCache.set(cacheKey, inventory, 180);
      }
    }

    return NextResponse.json(inventory, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600', // 5 min client, 10 min CDN
      }
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array if DB not available
  }
}