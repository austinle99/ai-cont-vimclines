import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json([]);
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');
    
    const alerts = await prisma.alert.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to 50 most recent alerts
    });

    return NextResponse.json(alerts, {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=300', // 2 min client, 5 min CDN
      }
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array if DB not available
  }
}