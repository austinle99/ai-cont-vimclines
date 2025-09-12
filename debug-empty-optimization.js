const { PrismaClient } = require('@prisma/client');

async function debugEmptyOptimization() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Debugging empty container optimization...\n');
    
    // Count empty vs laden containers
    const emptyCount = await prisma.booking.count({
      where: {
        emptyLaden: {
          contains: 'Empty',
          mode: 'insensitive'
        }
      }
    });
    
    const ladenCount = await prisma.booking.count({
      where: {
        emptyLaden: {
          contains: 'Laden', 
          mode: 'insensitive'
        }
      }
    });
    
    console.log('📊 Container Status Count:');
    console.log(`   Empty containers: ${emptyCount}`);
    console.log(`   Laden containers: ${ladenCount}`);
    
    // Get sample empty containers with their optimization data
    const emptyContainers = await prisma.booking.findMany({
      where: {
        emptyLaden: {
          contains: 'Empty',
          mode: 'insensitive'
        }
      },
      take: 10,
      select: {
        containerNo: true,
        origin: true,
        destination: true,
        depot: true,
        emptyLaden: true,
        optimizationSuggestion: true,
        optimizationScore: true,
        optimizationType: true,
        date: true
      }
    });
    
    console.log(`\n📦 Sample Empty Containers (${emptyContainers.length} shown):`);
    emptyContainers.forEach((container, index) => {
      console.log(`   ${index + 1}. Container: ${container.containerNo}`);
      console.log(`      Route: ${container.origin} → ${container.destination}`);
      console.log(`      Depot: ${container.depot}`);
      console.log(`      Status: "${container.emptyLaden}"`);
      console.log(`      Optimization: "${container.optimizationSuggestion || 'NONE'}"`);
      console.log(`      Score: ${container.optimizationScore || 'NONE'}`);
      console.log(`      Type: ${container.optimizationType || 'NONE'}`);
      console.log(`      Date: ${container.date}`);
      console.log('');
    });
    
    // Check for high-priority empty container issues
    const urgentEmpty = await prisma.booking.count({
      where: {
        AND: [
          { emptyLaden: { contains: 'Empty', mode: 'insensitive' } },
          { optimizationType: 'urgent-relocation' }
        ]
      }
    });
    
    const highPriorityEmpty = await prisma.booking.count({
      where: {
        AND: [
          { emptyLaden: { contains: 'Empty', mode: 'insensitive' } },
          { optimizationType: 'high-priority' }
        ]
      }
    });
    
    console.log('🚨 Priority Empty Container Analysis:');
    console.log(`   Urgent relocation needed: ${urgentEmpty}`);
    console.log(`   High priority: ${highPriorityEmpty}`);
    
    // Check depot utilization for empty containers
    const depotEmptyStats = await prisma.booking.groupBy({
      by: ['depot'],
      where: {
        emptyLaden: {
          contains: 'Empty',
          mode: 'insensitive'
        }
      },
      _count: {
        depot: true
      },
      orderBy: {
        _count: {
          depot: 'desc'
        }
      },
      take: 10
    });
    
    console.log('\n🏭 Empty Containers by Depot:');
    depotEmptyStats.forEach((stat, index) => {
      console.log(`   ${index + 1}. ${stat.depot}: ${stat._count.depot} empty containers`);
    });
    
    // Check AI Proposals specifically for empty containers
    const emptyProposals = await prisma.proposal.findMany({
      where: {
        OR: [
          { reason: { contains: 'empty', mode: 'insensitive' } },
          { reason: { contains: 'relocation', mode: 'insensitive' } },
          { route: { contains: 'empty', mode: 'insensitive' } }
        ]
      }
    });
    
    console.log(`\n💡 Empty Container Proposals: ${emptyProposals.length}`);
    emptyProposals.forEach((proposal, index) => {
      console.log(`   ${index + 1}. Route: ${proposal.route}`);
      console.log(`      Reason: ${proposal.reason}`);
      console.log(`      Status: ${proposal.status}`);
      console.log('');
    });
    
    // Check if AI suggestion generation was called
    console.log('\n🤖 Checking AI suggestion system...');
    const allProposals = await prisma.proposal.count();
    const allAlerts = await prisma.alert.count();
    
    console.log(`   Total proposals: ${allProposals}`);
    console.log(`   Total alerts: ${allAlerts}`);
    
    console.log('\n✅ Empty container optimization diagnostic complete!');
    
  } catch (error) {
    console.error('❌ Diagnostic error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugEmptyOptimization();