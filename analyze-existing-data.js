#!/usr/bin/env node

/**
 * Analyze existing database data to understand current data structure
 * and provide recommendations for optimal Excel imports
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeData() {
  console.log('🔍 Analyzing existing database data...\n');

  try {
    // Analyze Inventory
    console.log('📦 INVENTORY DATA:');
    const inventory = await prisma.inventory.findMany();
    console.log(`   Total records: ${inventory.length}`);
    
    if (inventory.length > 0) {
      const sampleInv = inventory[0];
      console.log('   Sample record:', {
        port: sampleInv.port,
        type: sampleInv.type,
        stock: sampleInv.stock
      });
      
      const ports = [...new Set(inventory.map(i => i.port))];
      const types = [...new Set(inventory.map(i => i.type))];
      console.log(`   Unique ports: ${ports.length} (${ports.join(', ')})`);
      console.log(`   Container types: ${types.length} (${types.join(', ')})`);
    }

    // Analyze Bookings (Critical for LSTM)
    console.log('\n📋 BOOKING DATA:');
    const totalBookings = await prisma.booking.count();
    console.log(`   Total records: ${totalBookings}`);

    let recentBookings = 0;
    let emptyBookings = 0;
    let routes = [];

    if (totalBookings > 0) {
      const sampleBooking = await prisma.booking.findFirst();
      console.log('   Sample record:', {
        date: sampleBooking.date,
        origin: sampleBooking.origin,
        destination: sampleBooking.destination,
        size: sampleBooking.size,
        qty: sampleBooking.qty,
        emptyLaden: sampleBooking.emptyLaden,
        optimizationType: sampleBooking.optimizationType,
        optimizationScore: sampleBooking.optimizationScore
      });

      // Recent bookings (important for LSTM)
      recentBookings = await prisma.booking.count({
        where: {
          date: {
            gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
          }
        }
      });
      console.log(`   Recent bookings (60 days): ${recentBookings}`);

      // Empty container analysis
      emptyBookings = await prisma.booking.count({
        where: {
          emptyLaden: {
            contains: 'Empty',
            mode: 'insensitive'
          }
        }
      });
      console.log(`   Empty container bookings: ${emptyBookings}`);

      // Date range analysis
      const oldestBooking = await prisma.booking.findFirst({
        orderBy: { date: 'asc' }
      });
      const newestBooking = await prisma.booking.findFirst({
        orderBy: { date: 'desc' }
      });

      if (oldestBooking && newestBooking) {
        const daySpan = Math.floor((newestBooking.date.getTime() - oldestBooking.date.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`   Data span: ${daySpan} days (${oldestBooking.date.toDateString()} to ${newestBooking.date.toDateString()})`);
      }

      // Route analysis
      routes = await prisma.booking.groupBy({
        by: ['origin', 'destination'],
        _count: true
      });
      console.log(`   Unique routes: ${routes.length}`);
      const topRoutes = routes
        .sort((a, b) => b._count - a._count)
        .slice(0, 5)
        .map(r => `${r.origin}-${r.destination} (${r._count})`);
      console.log(`   Top routes: ${topRoutes.join(', ')}`);
    }

    // Analyze Proposals
    console.log('\n💡 PROPOSALS DATA:');
    const proposals = await prisma.proposal.count();
    console.log(`   Total records: ${proposals}`);

    if (proposals > 0) {
      const statusBreakdown = await prisma.proposal.groupBy({
        by: ['status'],
        _count: true
      });
      console.log('   Status breakdown:', statusBreakdown.map(s => `${s.status}: ${s._count}`).join(', '));
    }

    // Analyze ML Training Data
    console.log('\n🤖 ML TRAINING DATA:');
    const mlData = await prisma.mLTrainingData.count();
    console.log(`   ML training records: ${mlData}`);

    // Analyze Alerts
    console.log('\n⚠️  ALERTS DATA:');
    const alerts = await prisma.alert.count();
    console.log(`   Total alerts: ${alerts}`);

    // Data Quality Assessment
    console.log('\n📊 DATA QUALITY ASSESSMENT:');
    
    // LSTM Readiness
    console.log('\n🔮 LSTM System Readiness:');
    if (recentBookings >= 30) {
      console.log(`   ✅ Recent bookings: ${recentBookings}/30 (sufficient)`);
    } else {
      console.log(`   ❌ Recent bookings: ${recentBookings}/30 (need ${30 - recentBookings} more)`);
    }

    if (totalBookings >= 100) {
      console.log(`   ✅ Total bookings: ${totalBookings}/100 (sufficient)`);
    } else {
      console.log(`   ❌ Total bookings: ${totalBookings}/100 (need ${100 - totalBookings} more)`);
    }

    if (emptyBookings > 0) {
      const emptyRatio = (emptyBookings / totalBookings) * 100;
      console.log(`   ✅ Empty container data: ${emptyBookings} records (${emptyRatio.toFixed(1)}%)`);
    } else {
      console.log(`   ❌ Empty container data: No empty/laden classification found`);
    }

    // OR-Tools Readiness
    console.log('\n🎯 OR-Tools System Readiness:');
    const portsCount = [...new Set(inventory.map(i => i.port))].length;
    if (portsCount >= 3) {
      console.log(`   ✅ Ports: ${portsCount} (sufficient for optimization)`);
    } else {
      console.log(`   ❌ Ports: ${portsCount} (need at least 3 for meaningful optimization)`);
    }

    if (routes.length >= 5) {
      console.log(`   ✅ Routes: ${routes.length} (sufficient for optimization)`);
    } else {
      console.log(`   ❌ Routes: ${routes.length} (need more route variety)`);
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    
    if (recentBookings < 30) {
      console.log('   🔮 For LSTM: Upload Excel files with recent booking data (last 60 days)');
    }
    
    if (totalBookings < 100) {
      console.log('   🔮 For LSTM: Upload historical Excel files to reach 100+ total bookings');
    }
    
    if (emptyBookings === 0) {
      console.log('   🔮 For LSTM: Ensure Excel files include Empty/Laden container classification');
    }
    
    if (portsCount < 5) {
      console.log('   🎯 For OR-Tools: Include data from more ports for better optimization');
    }

    if (inventory.length < 10) {
      console.log('   🧠 For ML: Upload current inventory data for better suggestions');
    }

    console.log('\n✅ Analysis complete!');

  } catch (error) {
    console.error('❌ Error analyzing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeData();