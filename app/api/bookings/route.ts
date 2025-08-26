import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json([]);
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');
    
    const bookings = await prisma.booking.findMany({ 
      orderBy: [{ date: "desc" }] 
    });
    
    return NextResponse.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array if DB not available
  }
}