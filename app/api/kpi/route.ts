import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json(null);
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');
    
    const kpi = await prisma.kPI.findFirst();
    
    return NextResponse.json(kpi);
  } catch (error) {
    console.error('Error fetching KPI:', error);
    return NextResponse.json(null, { status: 200 }); // Return null if DB not available
  }
}