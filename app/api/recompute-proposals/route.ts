import { NextRequest, NextResponse } from 'next/server';
import { recomputeProposals } from '../../action';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting proposal recomputation...');
    
    const result = await recomputeProposals();
    
    console.log('✅ Proposal recomputation completed');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Proposals recomputed successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error recomputing proposals:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to recompute proposals', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}