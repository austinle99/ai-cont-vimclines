import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Configure route settings
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout

// Test endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'iShip Data API is accessible',
    endpoint: '/api/iship-data',
    method: 'POST',
    description: 'Accepts container data scraped from iShip via Power Automate Desktop'
  });
}

// Interface for iShip data from PAD
interface IShipDataInput {
  containerNo: string;
  containerType?: string;
  emptyLaden?: string;
  depot?: string;
  shipmentNo?: string;
  bookingNo?: string;
  billOfLading?: string;
  origin?: string;
  destination?: string;
  shipper?: string;
  consignee?: string;
  commodity?: string;
  gateInDate?: string | Date;
  gateOutDate?: string | Date;
  estimatedPickupDate?: string | Date;
  actualPickupDate?: string | Date;
  currentStatus?: string;
  remarks?: string;
  sourceUrl?: string;
}

// POST endpoint to receive data from Power Automate Desktop
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  console.log('🚀 Starting iShip data import from PAD...');

  try {
    const body = await req.json();

    // Support both single container and batch import
    const containers: IShipDataInput[] = Array.isArray(body) ? body : [body];

    if (containers.length === 0) {
      return NextResponse.json({
        error: 'No container data provided'
      }, { status: 400 });
    }

    console.log(`📦 Processing ${containers.length} container(s)...`);

    const results = {
      success: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
      containerIds: [] as string[],
      longstayAlerts: [] as any[]
    };

    // Process each container
    for (const containerData of containers) {
      try {
        // Validate required fields
        if (!containerData.containerNo) {
          results.failed++;
          results.errors.push('Container number is required');
          continue;
        }

        // Normalize container number
        const containerNo = containerData.containerNo.trim().toUpperCase();

        // Generate data hash to detect duplicates
        const dataString = JSON.stringify({
          containerNo,
          depot: containerData.depot,
          gateInDate: containerData.gateInDate,
          currentStatus: containerData.currentStatus
        });
        const dataHash = crypto.createHash('md5').update(dataString).digest('hex');

        // Check for duplicate data
        const existingData = await prisma.iShipData.findFirst({
          where: { dataHash }
        });

        if (existingData) {
          console.log(`⚠️ Duplicate data detected for ${containerNo}, skipping...`);
          continue;
        }

        // Parse dates
        const parseDate = (dateStr?: string | Date) => {
          if (!dateStr) return undefined;
          if (dateStr instanceof Date) return dateStr;
          const parsed = new Date(dateStr);
          return isNaN(parsed.getTime()) ? undefined : parsed;
        };

        const gateInDate = parseDate(containerData.gateInDate);
        const gateOutDate = parseDate(containerData.gateOutDate);
        const estimatedPickupDate = parseDate(containerData.estimatedPickupDate);
        const actualPickupDate = parseDate(containerData.actualPickupDate);

        // Normalize empty/laden status
        let emptyLaden = containerData.emptyLaden?.toLowerCase() || '';
        if (emptyLaden.includes('empty') || emptyLaden === 'e' || emptyLaden === '1') {
          emptyLaden = 'empty';
        } else if (emptyLaden.includes('laden') || emptyLaden.includes('full') || emptyLaden === 'f' || emptyLaden === '0') {
          emptyLaden = 'laden';
        }

        // Create or update ContainerTracking
        let containerTracking = await prisma.containerTracking.findUnique({
          where: { containerNo }
        });

        const currentDate = new Date();
        const lastMovementDate = actualPickupDate || gateOutDate || gateInDate || currentDate;

        if (containerTracking) {
          // Calculate dwell days
          const dwellDays = Math.floor(
            (currentDate.getTime() - new Date(containerTracking.lastMovementDate).getTime())
            / (1000 * 60 * 60 * 24)
          );

          // Update existing tracking
          containerTracking = await prisma.containerTracking.update({
            where: { containerNo },
            data: {
              containerType: containerData.containerType || containerTracking.containerType,
              emptyLaden: emptyLaden || containerTracking.emptyLaden,
              currentLocation: containerData.depot || containerTracking.currentLocation,
              lastMovementDate,
              dwellDays,
              shipmentId: containerData.shipmentNo || containerTracking.shipmentId,
              billOfLading: containerData.billOfLading || containerTracking.billOfLading,
              consignee: containerData.consignee || containerTracking.consignee,
              status: actualPickupDate ? 'picked-up' :
                      dwellDays > 21 ? 'longstay' :
                      dwellDays > 14 ? 'longstay' : 'active',
              // Append to movement history
              movementHistory: {
                ...(containerTracking.movementHistory as object || {}),
                movements: [
                  ...((containerTracking.movementHistory as any)?.movements || []),
                  {
                    date: currentDate.toISOString(),
                    location: containerData.depot,
                    status: containerData.currentStatus,
                    source: 'iship-pad'
                  }
                ]
              }
            }
          });
          results.updated++;
        } else {
          // Create new tracking record
          containerTracking = await prisma.containerTracking.create({
            data: {
              containerNo,
              containerType: containerData.containerType || 'UNKNOWN',
              emptyLaden: emptyLaden || 'unknown',
              currentLocation: containerData.depot || 'UNKNOWN',
              lastMovementDate,
              firstSeenDate: gateInDate || currentDate,
              dwellDays: 0,
              shipmentId: containerData.shipmentNo,
              billOfLading: containerData.billOfLading,
              consignee: containerData.consignee,
              status: 'active',
              movementHistory: {
                movements: [{
                  date: currentDate.toISOString(),
                  location: containerData.depot,
                  status: containerData.currentStatus,
                  source: 'iship-pad'
                }]
              }
            }
          });
          results.success++;
        }

        // Save raw iShip data
        await prisma.iShipData.create({
          data: {
            containerTrackingId: containerTracking.id,
            containerNo,
            shipmentNo: containerData.shipmentNo,
            bookingNo: containerData.bookingNo,
            billOfLading: containerData.billOfLading,
            containerType: containerData.containerType,
            emptyLaden,
            depot: containerData.depot,
            origin: containerData.origin,
            destination: containerData.destination,
            shipper: containerData.shipper,
            consignee: containerData.consignee,
            commodity: containerData.commodity,
            gateInDate,
            gateOutDate,
            estimatedPickupDate,
            actualPickupDate,
            currentStatus: containerData.currentStatus,
            remarks: containerData.remarks,
            sourceUrl: containerData.sourceUrl,
            dataHash
          }
        });

        results.containerIds.push(containerTracking.id);

        // Trigger longstay analysis for empty containers
        if (emptyLaden === 'empty' && containerTracking.dwellDays >= 7) {
          const longstayAnalysis = await performLongstayAnalysis(containerTracking);
          if (longstayAnalysis.riskLevel === 'high' || longstayAnalysis.riskLevel === 'critical') {
            results.longstayAlerts.push({
              containerNo,
              dwellDays: containerTracking.dwellDays,
              riskLevel: longstayAnalysis.riskLevel,
              riskScore: longstayAnalysis.longstayRiskScore,
              recommendedAction: longstayAnalysis.recommendedAction
            });
          }
        }

      } catch (error: any) {
        console.error(`❌ Error processing container ${containerData.containerNo}:`, error);
        results.failed++;
        results.errors.push(`${containerData.containerNo}: ${error.message}`);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ iShip data import completed in ${processingTime}ms`);
    console.log(`   Success: ${results.success}, Updated: ${results.updated}, Failed: ${results.failed}`);

    return NextResponse.json({
      success: true,
      message: 'iShip data processed successfully',
      results,
      processingTime,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error processing iShip data:', error);
    return NextResponse.json({
      error: 'Failed to process iShip data',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to perform longstay analysis
async function performLongstayAnalysis(containerTracking: any) {
  const currentDwellDays = containerTracking.dwellDays;

  // Calculate risk score based on multiple factors
  let riskScore = 0;

  // Factor 1: Current dwell time (0-40 points)
  riskScore += Math.min(currentDwellDays * 2, 40);

  // Factor 2: Empty container priority (20 points if empty)
  if (containerTracking.emptyLaden === 'empty') {
    riskScore += 20;
  }

  // Factor 3: Location congestion (placeholder - would need historical data)
  // For now, add 10 points as baseline
  riskScore += 10;

  // Factor 4: Seasonal patterns (placeholder)
  const currentMonth = new Date().getMonth();
  const peakSeasons = [0, 1, 10, 11]; // Jan, Feb, Nov, Dec
  if (peakSeasons.includes(currentMonth)) {
    riskScore += 15;
  }

  // Factor 5: Container type (some types are more prone to longstay)
  if (containerTracking.containerType?.includes('40HC')) {
    riskScore += 10;
  }

  // Normalize to 0-100
  riskScore = Math.min(riskScore, 100);

  // Determine risk level
  let riskLevel = 'low';
  if (riskScore >= 80) riskLevel = 'critical';
  else if (riskScore >= 60) riskLevel = 'high';
  else if (riskScore >= 40) riskLevel = 'medium';

  // Predict future dwell days (simple linear projection)
  const predictedDwellDays = Math.round(currentDwellDays * 1.5);

  // Determine recommended action
  let recommendedAction = 'monitor';
  let suggestedDestination = null;

  if (riskScore >= 80) {
    recommendedAction = 'urgent-pickup';
  } else if (riskScore >= 60) {
    recommendedAction = 'relocate';
    // Would need optimization logic to determine best destination
    suggestedDestination = 'High-demand depot';
  } else if (riskScore >= 40) {
    recommendedAction = 'schedule-pickup';
  }

  // Calculate estimated costs (placeholder values)
  const dailyStorageCost = 5; // USD per day
  const estimatedCost = currentDwellDays * dailyStorageCost;
  const potentialSavings = recommendedAction === 'relocate' ? estimatedCost * 0.6 : 0;

  // Create or update longstay analysis
  const analysis = await prisma.longstayAnalysis.upsert({
    where: {
      id: `${containerTracking.id}-${new Date().toISOString().split('T')[0]}`
    },
    update: {
      currentDwellDays,
      predictedDwellDays,
      longstayRiskScore: riskScore,
      riskLevel,
      recommendedAction,
      suggestedDestination,
      estimatedCost,
      potentialSavings
    },
    create: {
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
      historicalPattern: {},
      seasonalFactors: {},
      locationFactors: {},
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
