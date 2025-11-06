import EnsembleServiceSingleton from '@/lib/ml/ensembleServiceSingleton';
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

const isDev = process.env.NODE_ENV === 'development';

export async function GET(req: NextRequest) {
  try {
    // Get forecast horizon from query params
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '7');
    const port = url.searchParams.get('port');
    const containerType = url.searchParams.get('type');

    if (isDev) console.log(`🔮 Prediction API called: ${days} days, port=${port || 'all'}, type=${containerType || 'all'}`);

    // Validate parameters
    if (days < 1 || days > 30) {
      return Response.json({
        success: false,
        error: 'Days must be between 1 and 30'
      }, { status: 400 });
    }

    // Load historical data
    const where: any = {};
    if (port) where.origin = port;
    if (containerType) where.size = containerType;

    const bookings = await prisma.booking.findMany({
      where,
      take: 500,
      orderBy: { date: 'desc' }
    });

    if (isDev) console.log(`📊 Loaded ${bookings.length} historical bookings`);

    if (bookings.length === 0) {
      return Response.json({
        success: false,
        error: 'No historical data found. Please upload data first.'
      }, { status: 404 });
    }

    // Generate predictions using singleton (no initialization needed - cached)
    if (isDev) console.log(`🤖 Generating predictions using singleton...`);
    const predictions = await EnsembleServiceSingleton.getPredictions(bookings, days);

    if (isDev) console.log(`✅ Generated ${predictions.length} predictions`);

    // Format response
    const formattedPredictions = predictions.map(p => ({
      date: p.date.toISOString().split('T')[0],
      port: p.port,
      containerType: p.containerType,
      predictedEmpty: Math.round(p.predictedEmptyCount),
      confidence: parseFloat((p.confidence * 100).toFixed(1)),
      confidenceLabel: `${(p.confidence * 100).toFixed(1)}%`,
      riskLevel: p.riskLevel,
      method: p.method,
      trend: p.trend || 'stable',
      breakdown: {
        gbr: p.components.gbr ? Math.round(p.components.gbr) : null,
        lstm: p.components.lstm ? Math.round(p.components.lstm) : null,
        ensemble: p.components.ensemble ? Math.round(p.components.ensemble) : null
      },
      weights: {
        gbr: parseFloat((p.weights.gbr * 100).toFixed(1)),
        lstm: parseFloat((p.weights.lstm * 100).toFixed(1))
      }
    }));

    // Calculate metadata
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    const riskBreakdown = {
      high: predictions.filter(p => p.riskLevel === 'high').length,
      medium: predictions.filter(p => p.riskLevel === 'medium').length,
      low: predictions.filter(p => p.riskLevel === 'low').length
    };

    return Response.json({
      success: true,
      predictions: formattedPredictions,
      metadata: {
        totalPredictions: predictions.length,
        avgConfidence: parseFloat((avgConfidence * 100).toFixed(1)),
        avgConfidenceLabel: `${(avgConfidence * 100).toFixed(1)}%`,
        horizon: `${days} days`,
        trainingDataSize: bookings.length,
        riskBreakdown,
        filters: {
          port: port || 'all',
          containerType: containerType || 'all'
        },
        generatedAt: new Date().toISOString()
      }
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600', // Cache for 5 min client, 10 min CDN
      }
    });

  } catch (error) {
    console.error('❌ Prediction API error:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
