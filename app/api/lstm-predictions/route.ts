import { NextRequest, NextResponse } from 'next/server';
import { LSTMPredictionService } from '@/lib/ml/lstmPredictionService';

// Dynamic import to avoid build issues
async function getPrisma() {
  const { prisma } = await import("@/lib/db");
  return prisma;
}

// Global service instance (in production, consider using a proper singleton pattern)
let predictionService: LSTMPredictionService | null = null;

async function getPredictionService(): Promise<LSTMPredictionService> {
  if (!predictionService) {
    predictionService = new LSTMPredictionService();
    await predictionService.initialize();
  }
  return predictionService;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const withInsights = searchParams.get('insights') === 'true';

    const service = await getPredictionService();
    const prisma = await getPrisma();

    // Get recent bookings for prediction context (last 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentBookings = await prisma.booking.findMany({
      where: {
        date: {
          gte: sixtyDaysAgo
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    if (recentBookings.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No recent booking data available for predictions'
      }, { status: 400 });
    }

    // Check if model needs training
    const trainingStatus = service.getTrainingStatus();
    if (!trainingStatus.lastTrainingDate) {
      return NextResponse.json({
        success: false,
        error: 'Model not trained yet. Please train the model first.',
        needsTraining: true
      }, { status: 400 });
    }

    const predictions = await service.getPredictions(recentBookings, days);

    let insights = null;
    if (withInsights) {
      insights = await service.getPredictionInsights(predictions);
    }

    return NextResponse.json({
      success: true,
      data: {
        predictions,
        insights,
        metadata: {
          predictionDays: days,
          dataSourceDays: 60,
          totalBookingsAnalyzed: recentBookings.length,
          modelLastTrained: trainingStatus.lastTrainingDate,
          modelPerformance: trainingStatus.modelPerformance
        }
      }
    });

  } catch (error) {
    console.error('Error generating LSTM predictions:', error);
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

    const service = await getPredictionService();
    const prisma = await getPrisma();

    if (action === 'train') {
      // Train the LSTM model
      const trainingStatus = service.getTrainingStatus();
      
      if (trainingStatus.isTraining) {
        return NextResponse.json({
          success: false,
          error: 'Model is already training'
        }, { status: 400 });
      }

      // Get all historical bookings for training
      const allBookings = await prisma.booking.findMany({
        orderBy: {
          date: 'asc'
        }
      });

      if (allBookings.length < 100) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient data for training. Need at least 100 booking records.'
        }, { status: 400 });
      }

      // Start training (this will run asynchronously)
      service.trainModel(allBookings)
        .then((metrics) => {
          console.log('✅ LSTM training completed:', metrics);
        })
        .catch((error) => {
          console.error('❌ LSTM training failed:', error);
        });

      return NextResponse.json({
        success: true,
        message: 'LSTM training started',
        data: {
          totalSamples: allBookings.length,
          trainingStatus: service.getTrainingStatus()
        }
      });

    } else if (action === 'predict') {
      // Custom prediction with provided data
      const { bookings, futureDays = 7 } = data;
      
      if (!bookings || !Array.isArray(bookings)) {
        return NextResponse.json({
          success: false,
          error: 'Bookings data is required for custom predictions'
        }, { status: 400 });
      }

      const predictions = await service.getPredictions(bookings, futureDays);
      const insights = await service.getPredictionInsights(predictions);

      return NextResponse.json({
        success: true,
        data: {
          predictions,
          insights
        }
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Use "train" or "predict"'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in LSTM predictions POST:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}