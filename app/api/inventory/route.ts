import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json([]);
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');
    
    const inventory = await prisma.inventory.findMany({ 
      orderBy: [{ port: "asc" }, { type: "asc" }] 
    });
    
    return NextResponse.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array if DB not available
  }
}