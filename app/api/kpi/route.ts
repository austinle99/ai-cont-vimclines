import { NextResponse } from 'next/server';
import { redisCache, generateCacheKey } from '@/lib/cache/redisCache';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json(null);
    }

    // Try Redis cache first (TTL: 300 seconds = 5 minutes)
    const cacheKey = generateCacheKey('kpi', {});
    let kpi = await redisCache.get<any>(cacheKey);

    if (!kpi) {
      // Dynamic import to avoid build-time issues
      const { prisma } = await import('@/lib/db');

      kpi = await prisma.kPI.findFirst();

      // Cache for 5 minutes
      if (kpi) {
        await redisCache.set(cacheKey, kpi, 300);
      }
    }

    return NextResponse.json(kpi, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600', // 5 min client, 10 min CDN
      }
    });
  } catch (error) {
    console.error('Error fetching KPI:', error);
    return NextResponse.json(null, { status: 200 }); // Return null if DB not available
  }
}