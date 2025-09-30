import { NextRequest, NextResponse } from 'next/server';
import { ORToolsService } from '@/lib/optimization/orToolsService';
import { LSTMPredictionService } from '@/lib/ml/lstmPredictionService';

// Dynamic import to avoid build issues
async function getPrisma() {
  const { prisma } = await import("@/lib/db");
  return prisma;
}

// Global service instances
let orToolsService: ORToolsService | null = null;
let lstmService: LSTMPredictionService | null = null;

async function getORToolsService(): Promise<ORToolsService> {
  if (!orToolsService) {
    orToolsService = new ORToolsService();
    await orToolsService.initialize();
  }
  return orToolsService;
}

async function getLSTMService(): Promise<LSTMPredictionService> {
  if (!lstmService) {
    lstmService = new LSTMPredictionService();
    await lstmService.initialize();
  }
  return lstmService;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');

    if (action === 'status') {
      // Get service status
      const service = await getORToolsService();
      const status = service.getServiceStatus();
      
      return NextResponse.json({
        success: true,
        data: status
      });

    } else if (action === 'quick-optimization') {
      // Quick optimization with current data
      const optimizationType = searchParams.get('type') || 'comprehensive';
      
      const service = await getORToolsService();
      const prisma = await getPrisma();

      // Get current data
      const [inventory, bookings, proposals] = await Promise.all([
        prisma.inventory.findMany(),
        prisma.booking.findMany({
          where: {
            date: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          },
          orderBy: { date: 'desc' }
        }),
        prisma.proposal.findMany({
          where: {
            status: { not: 'completed' }
          }
        })
      ]);

      // Convert data to OR-Tools format
      const ports = inventory.map(inv => ({
        name: inv.port,
        current_empty: Math.floor(inv.stock * 0.3), // Estimate empty containers
        capacity: inv.stock * 2, // Estimate capacity
        lstm_forecast: [5, 4, 6, 7, 8, 9, 7], // Default forecast
        storage_cost: 2.0,
        handling_cost: 5.0,
        lat: 0, // Would need coordinates
        lng: 0
      }));

      const containers = bookings
        .filter(b => b.emptyLaden?.toLowerCase().includes('empty'))
        .map((b, index) => ({
          id: `C${index.toString().padStart(3, '0')}`,
          type: b.size || '20GP',
          current_port: b.origin,
          dwell_time: Math.floor((Date.now() - b.date.getTime()) / (1000 * 60 * 60 * 24)),
          next_booking_port: b.destination,
          priority: b.optimizationScore ? Math.floor(b.optimizationScore / 10) : 5
        }));

      // Simple routes (would need real route data)
      const routes = ports.flatMap(from => 
        ports.filter(to => to.name !== from.name).map(to => ({
          from: from.name,
          to: to.name,
          distance: 100, // Default distance
          cost: 50,
          transit_time: 24,
          capacity: 50
        }))
      );

      let result;
      
      if (optimizationType === 'redistribution') {
        result = await service.optimizeRedistribution(ports, containers, routes);
      } else if (optimizationType === 'comprehensive') {
        // Create some sample demands
        const demands = proposals.slice(0, 10).map((p, index) => ({
          id: p.id,
          port: p.route.split('-')[1] || ports[0]?.name || 'UNKNOWN',
          required_type: p.size || '20GP',
          quantity: p.qty,
          priority: 5,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }));

        result = await service.optimizeComprehensive(ports, containers, routes, demands);
      } else {
        return NextResponse.json({
          success: false,
          error: 'Invalid optimization type. Use "redistribution" or "comprehensive"'
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result,
        metadata: {
          ports_analyzed: ports.length,
          containers_analyzed: containers.length,
          routes_available: routes.length,
          optimization_type: optimizationType
        }
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Use "status" or "quick-optimization"'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in OR-Tools optimization GET:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;

    const service = await getORToolsService();

    if (action === 'custom-optimization') {
      // Custom optimization with provided data
      const { optimization_type, ports, containers, routes, demands, relocations } = data;

      let result;
      
      if (optimization_type === 'redistribution') {
        // Try to get LSTM predictions for enhanced optimization
        try {
          const lstmSvc = await getLSTMService();
          const prisma = await getPrisma();
          
          // Get recent bookings for LSTM context
          const recentBookings = await prisma.booking.findMany({
            where: {
              date: {
                gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // Last 60 days
              }
            }
          });

          const lstmPredictions = await lstmSvc.getPredictions(recentBookings, 7);
          
          // Convert LSTM predictions to OR-Tools format
          const formattedPredictions = lstmPredictions.map(pred => ({
            port: pred.port,
            container_type: pred.containerType,
            predictions: [pred.predictedEmptyCount],
            confidence: [pred.confidence]
          }));

          result = await service.optimizeRedistribution(ports, containers, routes, formattedPredictions);
        } catch (lstmError) {
          console.log('LSTM predictions failed, using OR-Tools only:', lstmError);
          result = await service.optimizeRedistribution(ports, containers, routes);
        }

      } else if (optimization_type === 'routing') {
        result = await service.optimizeRouting(relocations || [], routes);
        
      } else if (optimization_type === 'assignment') {
        result = await service.optimizeAssignment(containers, demands || [], routes);
        
      } else if (optimization_type === 'comprehensive') {
        result = await service.optimizeComprehensive(
          ports, 
          containers, 
          routes, 
          demands || []
        );
        
      } else {
        return NextResponse.json({
          success: false,
          error: 'Invalid optimization_type. Use: redistribution, routing, assignment, or comprehensive'
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: result
      });

    } else if (action === 'lstm-enhanced-optimization') {
      // Optimization enhanced with LSTM predictions
      const prisma = await getPrisma();
      const lstmSvc = await getLSTMService();

      // Get recent bookings for LSTM predictions
      const recentBookings = await prisma.booking.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // Last 60 days
          }
        }
      });

      if (recentBookings.length < 30) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient booking data for LSTM-enhanced optimization (need 30+ recent bookings)'
        }, { status: 400 });
      }

      // Get LSTM predictions
      const lstmPredictions = await lstmSvc.getPredictions(recentBookings, 7);
      const lstmInsights = await lstmSvc.getPredictionInsights(lstmPredictions);

      // Use provided data or generate from database
      const { ports, containers, routes } = data;

      // Convert LSTM predictions for OR-Tools
      const formattedPredictions = lstmPredictions.map(pred => ({
        port: pred.port,
        container_type: pred.containerType,
        predictions: Array(7).fill(pred.predictedEmptyCount),
        confidence: Array(7).fill(pred.confidence)
      }));

      // Run comprehensive optimization with LSTM enhancement
      const demands = data.demands || []; // Use provided or empty
      const result = await service.optimizeComprehensive(
        ports, 
        containers, 
        routes, 
        demands,
        formattedPredictions
      );

      // Add LSTM insights to recommendations
      result.combined_recommendations.unshift(
        '🧠 LSTM-Enhanced OR-Tools Optimization',
        `📊 LSTM Insights: ${lstmInsights.summary}`,
        `⚠️ Alert Level: ${lstmInsights.alertLevel}`,
        ...lstmInsights.recommendations.slice(0, 3)
      );

      return NextResponse.json({
        success: true,
        data: {
          ...result,
          lstm_insights: lstmInsights,
          lstm_predictions: lstmPredictions
        }
      });

    } else if (action === 'test-optimization') {
      // Test optimization with sample data
      const testResult = await service.optimizeRedistribution(
        [
          {
            name: 'VNHPH',
            current_empty: 25,
            capacity: 100,
            lstm_forecast: [20, 18, 22, 25, 28, 30, 27],
            storage_cost: 3.0,
            handling_cost: 8.0,
            lat: 20.8648,
            lng: 106.6835
          },
          {
            name: 'VNSGN',
            current_empty: 5,
            capacity: 150,
            lstm_forecast: [35, 40, 45, 50, 48, 45, 42],
            storage_cost: 2.5,
            handling_cost: 7.0,
            lat: 10.8231,
            lng: 106.6297
          }
        ],
        [
          {
            id: 'TEST001',
            type: '20GP',
            current_port: 'VNHPH',
            dwell_time: 8,
            priority: 9
          },
          {
            id: 'TEST002',
            type: '40GP',
            current_port: 'VNHPH',
            dwell_time: 12,
            priority: 7
          }
        ],
        [
          {
            from: 'VNHPH',
            to: 'VNSGN',
            distance: 1730,
            cost: 250,
            transit_time: 48,
            capacity: 30
          }
        ]
      );

      return NextResponse.json({
        success: true,
        data: testResult,
        message: 'Test optimization completed successfully'
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Use: custom-optimization, lstm-enhanced-optimization, or test-optimization'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in OR-Tools optimization POST:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}