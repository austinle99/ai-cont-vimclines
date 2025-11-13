const { PrismaClient } = require('@prisma/client');

async function testEmptyProposals() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Testing empty container proposal generation...\n');
    
    // First, let's trigger the recompute proposals API endpoint
    const response = await fetch('http://localhost:3002/api/recompute-proposals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Recompute API response:', result);
    } else {
      console.log('❌ API response failed:', response.status, response.statusText);
    }
    
    // Check if proposals were created
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for processing
    
    const proposals = await prisma.proposal.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`\n📋 Generated Proposals: ${proposals.length}`);
    
    // Specifically look for empty container proposals (should start with E)
    const emptyProposals = proposals.filter(p => p.id.startsWith('E'));
    const routeProposals = proposals.filter(p => p.id.startsWith('R'));
    const traditionalProposals = proposals.filter(p => p.id.startsWith('P'));
    
    console.log(`   Empty container proposals (E-series): ${emptyProposals.length}`);
    console.log(`   Route optimization proposals (R-series): ${routeProposals.length}`);
    console.log(`   Traditional inventory proposals (P-series): ${traditionalProposals.length}`);
    
    if (emptyProposals.length > 0) {
      console.log('\n🎯 Empty Container Proposals:');
      emptyProposals.slice(0, 5).forEach((proposal, index) => {
        console.log(`   ${index + 1}. ${proposal.id}: ${proposal.route}`);
        console.log(`      Qty: ${proposal.qty} x ${proposal.size}`);
        console.log(`      Reason: ${proposal.reason}`);
        console.log(`      Cost: $${proposal.estCost}, Benefit: $${proposal.benefit}`);
        console.log(`      Status: ${proposal.status}`);
        console.log('');
      });
    }
    
    if (routeProposals.length > 0) {
      console.log('🛣️ Route Optimization Proposals:');
      routeProposals.slice(0, 3).forEach((proposal, index) => {
        console.log(`   ${index + 1}. ${proposal.id}: ${proposal.route}`);
        console.log(`      Qty: ${proposal.qty} x ${proposal.size}`);
        console.log(`      Reason: ${proposal.reason}`);
        console.log('');
      });
    }
    
    console.log('✅ Empty container proposal test complete!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEmptyProposals();