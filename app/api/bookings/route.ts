import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json([]);
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');

    // Add pagination to prevent loading 10,000+ records
    const bookings = await prisma.booking.findMany({
      take: 100, // Limit to 100 most recent bookings
      orderBy: [{ date: "desc" }]
    });

    return NextResponse.json(bookings, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600', // 5 min client, 10 min CDN
      }
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array if DB not available
  }
}