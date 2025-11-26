import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET endpoint to retrieve longstay analysis data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Query parameters
    const riskLevel = searchParams.get('riskLevel'); // low, medium, high, critical
    const status = searchParams.get('status') || 'active'; // active, resolved, escalated
    const location = searchParams.get('location');
    const containerNo = searchParams.get('containerNo');
    const minDwellDays = searchParams.get('minDwellDays');
    const minRiskScore = searchParams.get('minRiskScore');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {};

    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (containerNo) where.containerNo = { contains: containerNo, mode: 'insensitive' };
    if (minDwellDays) where.currentDwellDays = { gte: parseInt(minDwellDays) };
    if (minRiskScore) where.longstayRiskScore = { gte: parseFloat(minRiskScore) };

    // If location is specified, need to join with containerTracking
    if (location) {
      where.containerTracking = {
        currentLocation: { contains: location, mode: 'insensitive' }
      };
    }

    // Fetch analyses with container tracking data
    const analyses = await prisma.longstayAnalysis.findMany({
      where,
      include: {
        containerTracking: {
          select: {
            containerNo: true,
            containerType: true,
            emptyLaden: true,
            currentLocation: true,
            lastMovementDate: true,
            firstSeenDate: true,
            dwellDays: true,
            status: true,
            shipmentId: true,
            billOfLading: true,
            movementHistory: true
          }
        }
      },
      orderBy: [
        { longstayRiskScore: 'desc' },
        { currentDwellDays: 'desc' }
      ],
      take: limit,
      skip: offset
    });

    // Get total count for pagination
    const totalCount = await prisma.longstayAnalysis.count({ where });

    // Calculate summary statistics
    const stats = {
      total: totalCount,
      critical: await prisma.longstayAnalysis.count({
        where: { ...where, riskLevel: 'critical' }
      }),
      high: await prisma.longstayAnalysis.count({
        where: { ...where, riskLevel: 'high' }
      }),
      medium: await prisma.longstayAnalysis.count({
        where: { ...where, riskLevel: 'medium' }
      }),
      low: await prisma.longstayAnalysis.count({
        where: { ...where, riskLevel: 'low' }
      }),
      averageRiskScore: analyses.length > 0
        ? analyses.reduce((sum, a) => sum + a.longstayRiskScore, 0) / analyses.length
        : 0,
      averageDwellDays: analyses.length > 0
        ? analyses.reduce((sum, a) => sum + a.currentDwellDays, 0) / analyses.length
        : 0,
      totalEstimatedCost: analyses.reduce((sum, a) => sum + (a.estimatedCost || 0), 0),
      totalPotentialSavings: analyses.reduce((sum, a) => sum + (a.potentialSavings || 0), 0)
    };

    // Group by location
    const byLocation: Record<string, any> = {};
    analyses.forEach(analysis => {
      const location = analysis.containerTracking?.currentLocation || 'Unknown';
      if (!byLocation[location]) {
        byLocation[location] = {
          count: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          totalRiskScore: 0,
          containers: []
        };
      }
      byLocation[location].count++;
      byLocation[location][analysis.riskLevel]++;
      byLocation[location].totalRiskScore += analysis.longstayRiskScore;
      byLocation[location].containers.push(analysis.containerNo);
    });

    // Calculate average risk score per location
    Object.keys(byLocation).forEach(loc => {
      byLocation[loc].averageRiskScore =
        byLocation[loc].totalRiskScore / byLocation[loc].count;
    });

    return NextResponse.json({
      success: true,
      data: analyses,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      },
      stats,
      byLocation,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error fetching longstay analysis:', error);
    return NextResponse.json({
      error: 'Failed to fetch longstay analysis',
      details: error.message
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

// POST endpoint to manually trigger analysis for specific containers
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { containerNos, forceReanalyze } = body;

    if (!containerNos || !Array.isArray(containerNos)) {
      return NextResponse.json({
        error: 'containerNos array is required'
      }, { status: 400 });
    }

    const results = {
      analyzed: 0,
      skipped: 0,
      errors: [] as string[],
      analyses: [] as any[]
    };

    for (const containerNo of containerNos) {
      try {
        const containerTracking = await prisma.containerTracking.findUnique({
          where: { containerNo: containerNo.trim().toUpperCase() }
        });

        if (!containerTracking) {
          results.skipped++;
          results.errors.push(`Container ${containerNo} not found`);
          continue;
        }

        // Check if recent analysis exists
        if (!forceReanalyze) {
          const existingAnalysis = await prisma.longstayAnalysis.findFirst({
            where: {
              containerNo: containerTracking.containerNo,
              status: 'active',
              analysisDate: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
              }
            }
          });

          if (existingAnalysis) {
            results.skipped++;
            continue;
          }
        }

        // Perform analysis (reusing logic from iship-data route)
        const analysis = await performLongstayAnalysisEnhanced(containerTracking);
        results.analyzed++;
        results.analyses.push(analysis);

      } catch (error: any) {
        results.errors.push(`${containerNo}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Longstay analysis completed',
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error performing longstay analysis:', error);
    return NextResponse.json({
      error: 'Failed to perform analysis',
      details: error.message
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

// Enhanced analysis function with more sophisticated logic
async function performLongstayAnalysisEnhanced(containerTracking: any) {
  const currentDwellDays = containerTracking.dwellDays;

  // Get historical data for this location
  const historicalData = await prisma.containerTracking.findMany({
    where: {
      currentLocation: containerTracking.currentLocation,
      emptyLaden: containerTracking.emptyLaden,
      status: { in: ['picked-up', 'relocated'] },
      dwellDays: { gt: 0 }
    },
    select: {
      dwellDays: true,
      containerType: true
    },
    take: 100
  });

  // Calculate historical average dwell time
  const avgHistoricalDwell = historicalData.length > 0
    ? historicalData.reduce((sum, h) => sum + h.dwellDays, 0) / historicalData.length
    : 14; // Default to 14 days if no history

  // Calculate risk score with multiple weighted factors
  let riskScore = 0;

  // Factor 1: Current vs historical average (0-30 points)
  const dwellRatio = currentDwellDays / avgHistoricalDwell;
  riskScore += Math.min(dwellRatio * 15, 30);

  // Factor 2: Absolute dwell time (0-25 points)
  if (currentDwellDays >= 21) riskScore += 25;
  else if (currentDwellDays >= 14) riskScore += 20;
  else if (currentDwellDays >= 7) riskScore += 15;
  else riskScore += (currentDwellDays / 7) * 10;

  // Factor 3: Empty container priority (0-20 points)
  if (containerTracking.emptyLaden === 'empty') {
    riskScore += 20;
  }

  // Factor 4: Trend analysis from movement history (0-15 points)
  const movements = (containerTracking.movementHistory as any)?.movements || [];
  if (movements.length >= 2) {
    const recentMovements = movements.slice(-3);
    const stagnant = recentMovements.every((m: any) =>
      m.location === containerTracking.currentLocation
    );
    if (stagnant) riskScore += 15;
  }

  // Factor 5: Seasonal patterns (0-10 points)
  const currentMonth = new Date().getMonth();
  const peakSeasons = [0, 1, 10, 11]; // Jan, Feb, Nov, Dec
  if (peakSeasons.includes(currentMonth)) {
    riskScore += 10;
  }

  // Normalize to 0-100
  riskScore = Math.min(riskScore, 100);

  // Determine risk level
  let riskLevel = 'low';
  if (riskScore >= 80) riskLevel = 'critical';
  else if (riskScore >= 60) riskLevel = 'high';
  else if (riskScore >= 40) riskLevel = 'medium';

  // ML-based prediction (simple for now, can be enhanced with actual ML model)
  const predictedDwellDays = Math.round(
    currentDwellDays + (dwellRatio > 1 ? currentDwellDays * 0.3 : 5)
  );

  // Determine recommended action
  let recommendedAction = 'monitor';
  let suggestedDestination = null;

  if (riskScore >= 80) {
    recommendedAction = 'urgent-pickup';
  } else if (riskScore >= 60) {
    recommendedAction = 'relocate';

    // Find best destination based on inventory levels
    const inventoryLevels = await prisma.inventory.findMany({
      where: {
        type: containerTracking.containerType,
        port: { not: containerTracking.currentLocation }
      },
      orderBy: { stock: 'asc' },
      take: 1
    });

    if (inventoryLevels.length > 0) {
      suggestedDestination = inventoryLevels[0].port;
    }
  } else if (riskScore >= 40) {
    recommendedAction = 'schedule-pickup';
  }

  // Calculate costs
  const dailyStorageCost = 5; // USD per day
  const estimatedCost = currentDwellDays * dailyStorageCost;
  const potentialSavings = recommendedAction === 'relocate'
    ? estimatedCost * 0.6
    : recommendedAction === 'urgent-pickup'
      ? estimatedCost * 0.8
      : 0;

  // Save analysis
  const analysis = await prisma.longstayAnalysis.create({
    data: {
      containerTrackingId: containerTracking.id,
      containerNo: containerTracking.containerNo,
      currentDwellDays,
      predictedDwellDays,
      longstayRiskScore: riskScore,
      riskLevel,
      recommendedAction,
      suggestedDestination,
      estimatedCost,
      potentialSavings,
      historicalPattern: {
        avgDwellDays: avgHistoricalDwell,
        sampleSize: historicalData.length
      },
      seasonalFactors: {
        currentMonth,
        isPeakSeason: peakSeasons.includes(currentMonth)
      },
      locationFactors: {
        location: containerTracking.currentLocation,
        historicalAvg: avgHistoricalDwell
      },
      demandFactors: {}
    }
  });

  // Create alert if critical or high risk
  if (riskLevel === 'critical' || riskLevel === 'high') {
    await prisma.alert.create({
      data: {
        id: `longstay-${containerTracking.containerNo}-${Date.now()}`,
        level: riskLevel === 'critical' ? 'critical' : 'medium',
        message: `Longstay risk detected: ${containerTracking.containerNo}`,
        location: containerTracking.currentLocation,
        severity: riskLevel,
        description: `Container ${containerTracking.containerNo} has been at ${containerTracking.currentLocation} for ${currentDwellDays} days with ${riskScore.toFixed(0)}% longstay risk. Recommended action: ${recommendedAction}`,
        status: 'active'
      }
    });
  }

  return analysis;
}
