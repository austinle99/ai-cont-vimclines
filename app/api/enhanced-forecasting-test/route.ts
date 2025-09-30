import { NextRequest, NextResponse } from 'next/server';
import { EnhancedForecastingEngine, HistoricalPoint, LSTMPrediction } from '@/lib/ml/enhancedForecasting';
import { LSTMPredictionService } from '@/lib/ml/lstmPredictionService';
import { MLSuggestionEngine } from '@/lib/ml/enhancedSuggestions';

interface TestScenario {
  name: string;
  description: string;
  historicalData: HistoricalPoint[];
  lstmPredictions?: LSTMPrediction[];
  horizon: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'test-forecasting';
    const scenario = searchParams.get('scenario') || 'basic';

    console.log(`🧪 Running enhanced forecasting test - Action: ${action}, Scenario: ${scenario}`);

    switch (action) {
      case 'test-forecasting':
        return await testForecasting(scenario);
      case 'test-hybrid':
        return await testHybridForecasting(scenario);
      case 'test-multi-level':
        return await testMultiLevelForecasting();
      case 'test-safety-stock':
        return await testSafetyStockOptimization();
      case 'test-integration':
        return await testFullIntegration();
      case 'benchmark':
        return await benchmarkForecasting();
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ Enhanced forecasting test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function testForecasting(scenario: string): Promise<NextResponse> {
  const engine = new EnhancedForecastingEngine();
  const testScenarios = generateTestScenarios();
  const selectedScenario = testScenarios[scenario] || testScenarios.basic;

  console.log(`📊 Testing: ${selectedScenario.name}`);

  const startTime = Date.now();
  const result = await engine.generateForecast(
    selectedScenario.historicalData,
    selectedScenario.horizon,
    selectedScenario.lstmPredictions
  );
  const executionTime = Date.now() - startTime;

  // Calculate accuracy metrics if we have LSTM predictions to compare
  let accuracyMetrics = null;
  if (selectedScenario.lstmPredictions) {
    accuracyMetrics = calculateAccuracyMetrics(result, selectedScenario.lstmPredictions);
  }

  return NextResponse.json({
    success: true,
    data: {
      scenario: selectedScenario.name,
      description: selectedScenario.description,
      result: {
        method: result.method,
        forecast: result.forecast,
        confidence: result.confidence,
        components: result.components,
        executionTime: executionTime
      },
      metrics: {
        avgForecast: result.forecast.reduce((sum, val) => sum + val, 0) / result.forecast.length,
        avgConfidence: result.confidence.reduce((sum, val) => sum + val, 0) / result.confidence.length,
        forecastRange: {
          min: Math.min(...result.forecast),
          max: Math.max(...result.forecast)
        },
        executionTime: executionTime,
        accuracyMetrics
      }
    }
  });
}

async function testHybridForecasting(scenario: string): Promise<NextResponse> {
  const engine = new EnhancedForecastingEngine();
  const testData = generateTestScenarios();
  const selectedScenario = testData[scenario] || testData.basic;

  if (!selectedScenario.lstmPredictions) {
    return NextResponse.json({
      success: false,
      error: 'Hybrid forecasting requires LSTM predictions'
    }, { status: 400 });
  }

  console.log(`🤖 Testing hybrid forecasting: ${selectedScenario.name}`);

  const startTime = Date.now();

  // Test traditional only
  const traditionalResult = await engine.generateForecast(
    selectedScenario.historicalData,
    selectedScenario.horizon
  );

  // Test hybrid
  const hybridResult = await engine.generateForecast(
    selectedScenario.historicalData,
    selectedScenario.horizon,
    selectedScenario.lstmPredictions
  );

  const executionTime = Date.now() - startTime;

  // Compare results
  const comparison = {
    traditional: {
      method: traditionalResult.method,
      avgForecast: traditionalResult.forecast.reduce((sum, val) => sum + val, 0) / traditionalResult.forecast.length,
      avgConfidence: traditionalResult.confidence.reduce((sum, val) => sum + val, 0) / traditionalResult.confidence.length
    },
    hybrid: {
      method: hybridResult.method,
      avgForecast: hybridResult.forecast.reduce((sum, val) => sum + val, 0) / hybridResult.forecast.length,
      avgConfidence: hybridResult.confidence.reduce((sum, val) => sum + val, 0) / hybridResult.confidence.length
    },
    improvement: {
      confidenceImprovement: (hybridResult.confidence.reduce((sum, val) => sum + val, 0) / hybridResult.confidence.length) -
                             (traditionalResult.confidence.reduce((sum, val) => sum + val, 0) / traditionalResult.confidence.length)
    }
  };

  return NextResponse.json({
    success: true,
    data: {
      scenario: selectedScenario.name,
      comparison,
      hybridResult: {
        forecast: hybridResult.forecast,
        confidence: hybridResult.confidence,
        components: hybridResult.components
      },
      executionTime
    }
  });
}

async function testMultiLevelForecasting(): Promise<NextResponse> {
  const lstmService = new LSTMPredictionService();

  // Generate test booking data
  const testBookings = generateTestBookings();

  console.log('📊 Testing multi-level forecasting...');

  const startTime = Date.now();

  try {
    const multiLevelResult = await lstmService.getMultiLevelPredictions(testBookings, 7);
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        portForecasts: Object.keys(multiLevelResult.portForecasts).length,
        containerTypeForecasts: Object.keys(multiLevelResult.containerTypeForecasts).length,
        totalForecast: {
          method: multiLevelResult.totalForecast.method,
          avgForecast: multiLevelResult.totalForecast.forecast.reduce((sum, val) => sum + val, 0) / multiLevelResult.totalForecast.forecast.length,
          avgConfidence: multiLevelResult.totalForecast.confidence.reduce((sum, val) => sum + val, 0) / multiLevelResult.totalForecast.confidence.length
        },
        executionTime,
        details: multiLevelResult
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Multi-level forecasting failed'
    }, { status: 500 });
  }
}

async function testSafetyStockOptimization(): Promise<NextResponse> {
  const lstmService = new LSTMPredictionService();

  // Generate test inventory and booking data
  const testInventory = { port: 'TP.HCM', type: '20GP', safetyStock: 15, stock: 45 };
  const testBookings = generateTestBookings();

  console.log('🎯 Testing safety stock optimization...');

  const startTime = Date.now();

  try {
    const safetyResult = await lstmService.calculateOptimalSafetyStock(
      testInventory,
      testBookings,
      0.95, // 95% service level
      3 // 3-day lead time
    );
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        inventory: testInventory,
        optimization: safetyResult,
        executionTime
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Safety stock optimization failed'
    }, { status: 500 });
  }
}

async function testFullIntegration(): Promise<NextResponse> {
  console.log('🚀 Testing full enhanced forecasting integration...');

  const mlEngine = new MLSuggestionEngine();

  // Generate comprehensive test context
  const testContext = generateTestContext();

  const startTime = Date.now();

  try {
    // Initialize the ML engine
    await mlEngine.initialize();

    // Generate smart suggestions with enhanced forecasting
    const suggestions = await mlEngine.generateSmartSuggestions(testContext);
    const executionTime = Date.now() - startTime;

    // Analyze suggestions by source
    const suggestionAnalysis = {
      total: suggestions.length,
      bySource: suggestions.reduce((acc, suggestion) => {
        const source = suggestion.metadata?.source || 'traditional';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number }),
      avgConfidence: suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length,
      avgMLScore: suggestions.reduce((sum, s) => sum + s.mlScore, 0) / suggestions.length,
      enhancedSuggestions: suggestions.filter(s =>
        s.metadata?.source?.includes('Enhanced') ||
        s.metadata?.source?.includes('Hybrid') ||
        s.metadata?.source?.includes('Multi-Level')
      )
    };

    return NextResponse.json({
      success: true,
      data: {
        executionTime,
        analysis: suggestionAnalysis,
        enhancedSuggestions: suggestionAnalysis.enhancedSuggestions.map(s => ({
          id: s.id,
          message: s.message,
          priority: s.priority,
          confidence: s.confidence,
          mlScore: s.mlScore,
          source: s.metadata?.source,
          method: s.metadata?.method || s.metadata?.forecastMethod
        })),
        allSuggestions: suggestions.map(s => ({
          id: s.id,
          message: s.message,
          priority: s.priority,
          confidence: s.confidence,
          mlScore: s.mlScore
        }))
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Full integration test failed'
    }, { status: 500 });
  }
}

async function benchmarkForecasting(): Promise<NextResponse> {
  console.log('⚡ Running enhanced forecasting benchmarks...');

  const engine = new EnhancedForecastingEngine();
  const scenarios = generateTestScenarios();
  const results: any[] = [];

  for (const [scenarioName, scenario] of Object.entries(scenarios)) {
    const iterations = 5;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      try {
        await engine.generateForecast(
          scenario.historicalData,
          scenario.horizon,
          scenario.lstmPredictions
        );
        times.push(Date.now() - startTime);
      } catch (error) {
        console.warn(`Benchmark failed for scenario ${scenarioName}:`, error);
      }
    }

    if (times.length > 0) {
      results.push({
        scenario: scenarioName,
        avgTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        iterations: times.length
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      benchmarks: results,
      summary: {
        totalScenarios: results.length,
        avgExecutionTime: results.reduce((sum, r) => sum + r.avgTime, 0) / results.length,
        fastestScenario: results.reduce((min, r) => r.avgTime < min.avgTime ? r : min, results[0]),
        slowestScenario: results.reduce((max, r) => r.avgTime > max.avgTime ? r : max, results[0])
      }
    }
  });
}

function generateTestScenarios(): { [key: string]: TestScenario } {
  const baseDate = new Date('2024-01-01');

  return {
    basic: {
      name: 'Basic Holt-Winters Test',
      description: 'Simple seasonal data with 30 historical points',
      historicalData: Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
        value: 20 + 10 * Math.sin(2 * Math.PI * i / 7) + Math.random() * 5
      })),
      horizon: 7
    },
    hybrid: {
      name: 'Hybrid LSTM + Holt-Winters Test',
      description: 'Test with both historical data and LSTM predictions',
      historicalData: Array.from({ length: 45 }, (_, i) => ({
        timestamp: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
        value: 25 + 15 * Math.sin(2 * Math.PI * i / 7) + 0.5 * i + Math.random() * 8
      })),
      lstmPredictions: Array.from({ length: 7 }, (_, i) => ({
        timestamp: new Date(baseDate.getTime() + (45 + i) * 24 * 60 * 60 * 1000),
        value: 30 + 12 * Math.sin(2 * Math.PI * (45 + i) / 7) + Math.random() * 6,
        confidence: 0.7 + Math.random() * 0.2
      })),
      horizon: 7
    },
    trending: {
      name: 'Trending Data Test',
      description: 'Data with strong upward trend',
      historicalData: Array.from({ length: 60 }, (_, i) => ({
        timestamp: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
        value: 10 + 2 * i + 8 * Math.sin(2 * Math.PI * i / 7) + Math.random() * 4
      })),
      horizon: 14
    },
    volatile: {
      name: 'Volatile Data Test',
      description: 'High volatility data with seasonal patterns',
      historicalData: Array.from({ length: 40 }, (_, i) => ({
        timestamp: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
        value: Math.max(0, 20 + 15 * Math.sin(2 * Math.PI * i / 7) + Math.random() * 20 - 10)
      })),
      horizon: 10
    }
  };
}

function generateTestBookings(): any[] {
  const baseDate = new Date('2024-01-01');
  const ports = ['TP.HCM', 'Hải Phòng', 'Đà Nẵng', 'Cần Thơ'];
  const containerTypes = ['20GP', '40GP', '40HC', '45HC'];

  return Array.from({ length: 150 }, (_, i) => ({
    id: `booking_${i}`,
    date: new Date(baseDate.getTime() + Math.random() * 60 * 24 * 60 * 60 * 1000),
    origin: ports[Math.floor(Math.random() * ports.length)],
    destination: ports[Math.floor(Math.random() * ports.length)],
    size: containerTypes[Math.floor(Math.random() * containerTypes.length)],
    qty: Math.floor(Math.random() * 10) + 1
  }));
}

function generateTestContext(): any {
  return {
    kpi: {
      approvalRate: '78%',
      dwellTime: '4.2'
    },
    inventory: [
      { port: 'TP.HCM', type: '20GP', stock: 45, safetyStock: 15 },
      { port: 'TP.HCM', type: '40GP', stock: 32, safetyStock: 12 },
      { port: 'Hải Phòng', type: '20GP', stock: 67, safetyStock: 20 },
      { port: 'Đà Nẵng', type: '40HC', stock: 23, safetyStock: 10 }
    ],
    bookings: generateTestBookings(),
    proposals: [
      { status: 'draft', route: 'TP.HCM-Hải Phòng' },
      { status: 'pending', route: 'Đà Nẵng-TP.HCM' },
      { status: 'draft', route: 'Cần Thơ-TP.HCM' }
    ],
    alerts: [
      { location: 'TP.HCM', severity: 'warning' },
      { location: 'Hải Phòng', severity: 'info' }
    ],
    historical: []
  };
}

function calculateAccuracyMetrics(forecast: any, lstmPredictions: LSTMPrediction[]): any {
  // Simple accuracy metrics comparing forecast to LSTM predictions
  const errors = forecast.forecast.map((pred: number, i: number) => {
    if (i < lstmPredictions.length) {
      return Math.abs(pred - lstmPredictions[i].value);
    }
    return 0;
  }).filter((error: number) => error > 0);

  if (errors.length === 0) return null;

  return {
    mae: errors.reduce((sum: number, error: number) => sum + error, 0) / errors.length,
    mape: errors.reduce((sum: number, error: number, i: number) => {
      if (lstmPredictions[i]?.value > 0) {
        return sum + (error / lstmPredictions[i].value) * 100;
      }
      return sum;
    }, 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((sum: number, error: number) => sum + error * error, 0) / errors.length)
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;

    console.log(`🧪 Running POST enhanced forecasting test - Action: ${action}`);

    switch (action) {
      case 'custom-config':
        return await testWithCustomConfig(config);
      case 'stress-test':
        return await stressTestForecasting(config);
      default:
        return NextResponse.json({ error: 'Unknown POST action' }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ Enhanced forecasting POST test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function testWithCustomConfig(config: any): Promise<NextResponse> {
  const engine = new EnhancedForecastingEngine(config);
  const scenario = generateTestScenarios().basic;

  const startTime = Date.now();
  const result = await engine.generateForecast(scenario.historicalData, scenario.horizon);
  const executionTime = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    data: {
      customConfig: config,
      result: {
        method: result.method,
        avgForecast: result.forecast.reduce((sum, val) => sum + val, 0) / result.forecast.length,
        avgConfidence: result.confidence.reduce((sum, val) => sum + val, 0) / result.confidence.length,
        executionTime
      }
    }
  });
}

async function stressTestForecasting(config: any): Promise<NextResponse> {
  const iterations = config?.iterations || 10;
  const engine = new EnhancedForecastingEngine();
  const scenario = generateTestScenarios().hybrid;

  console.log(`🔥 Running stress test with ${iterations} iterations...`);

  const results: number[] = [];
  const errors: string[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const startTime = Date.now();
      await engine.generateForecast(scenario.historicalData, scenario.horizon, scenario.lstmPredictions);
      results.push(Date.now() - startTime);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      iterations,
      successfulRuns: results.length,
      failedRuns: errors.length,
      performance: {
        avgTime: results.reduce((sum, time) => sum + time, 0) / results.length,
        minTime: Math.min(...results),
        maxTime: Math.max(...results),
        totalTime: results.reduce((sum, time) => sum + time, 0)
      },
      errors: errors.slice(0, 5) // Show first 5 errors only
    }
  });
}