import { NextRequest, NextResponse } from 'next/server';
import { PredictionTestSuite } from '@/lib/testing/predictionTestSuite';

// Global test suite instance
let testSuite: PredictionTestSuite | null = null;

async function getTestSuite(): Promise<PredictionTestSuite> {
  if (!testSuite) {
    testSuite = new PredictionTestSuite();
  }
  return testSuite;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');
    const system = searchParams.get('system') as 'ml' | 'lstm' | 'or-tools' | 'integrated' | null;
    const scenario = searchParams.get('scenario');

    const suite = await getTestSuite();

    if (action === 'run-all') {
      // Run complete test suite
      console.log('🧪 Starting complete prediction test suite...');
      
      const results = await suite.runCompleteTestSuite();
      
      return NextResponse.json({
        success: true,
        data: results,
        message: `Test suite completed: ${results.summary.passed} passed, ${results.summary.failed} failed, ${results.summary.warnings} warnings`
      });

    } else if (action === 'test-system' && system) {
      // Test specific system
      console.log(`🔬 Testing ${system.toUpperCase()} system...`);
      
      const result = await suite.testSpecificSystem(system, scenario || undefined);
      
      return NextResponse.json({
        success: true,
        data: result,
        message: `${system.toUpperCase()} test completed with status: ${result.overall_status}`
      });

    } else if (action === 'benchmarks') {
      // Run performance benchmarks
      console.log('⚡ Running performance benchmarks...');
      
      const benchmarks = await suite.runPerformanceBenchmarks();
      
      return NextResponse.json({
        success: true,
        data: benchmarks,
        message: 'Performance benchmarks completed'
      });

    } else if (action === 'quick-test') {
      // Quick test of all systems
      console.log('🚀 Running quick test of all systems...');
      
      const results = await Promise.allSettled([
        suite.testSpecificSystem('ml', 'Small Scale Test'),
        suite.testSpecificSystem('lstm', 'Small Scale Test'),
        suite.testSpecificSystem('or-tools', 'Small Scale Test'),
        suite.testSpecificSystem('integrated', 'Small Scale Test')
      ]);

      const quickTestResults = {
        ml: results[0].status === 'fulfilled' ? results[0].value : { overall_status: 'failed', issues: ['Test failed to run'] },
        lstm: results[1].status === 'fulfilled' ? results[1].value : { overall_status: 'failed', issues: ['Test failed to run'] },
        or_tools: results[2].status === 'fulfilled' ? results[2].value : { overall_status: 'failed', issues: ['Test failed to run'] },
        integrated: results[3].status === 'fulfilled' ? results[3].value : { overall_status: 'failed', issues: ['Test failed to run'] }
      };

      const summary = {
        total_systems: 4,
        passed: Object.values(quickTestResults).filter(r => r.overall_status === 'passed').length,
        failed: Object.values(quickTestResults).filter(r => r.overall_status === 'failed').length,
        warnings: Object.values(quickTestResults).filter(r => r.overall_status === 'warning').length
      };

      return NextResponse.json({
        success: true,
        data: {
          summary,
          results: quickTestResults
        },
        message: `Quick test completed: ${summary.passed}/${summary.total_systems} systems passed`
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Use: run-all, test-system, benchmarks, or quick-test',
        available_actions: [
          'run-all: Run complete test suite',
          'test-system: Test specific system (requires system parameter)',
          'benchmarks: Run performance benchmarks',
          'quick-test: Quick test of all systems'
        ],
        available_systems: ['ml', 'lstm', 'or-tools', 'integrated'],
        available_scenarios: ['Small Scale Test', 'Medium Scale Test', 'Large Scale Test', 'Edge Case Test']
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in prediction testing:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      suggestion: 'Check system configurations and ensure all services are properly initialized'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, config = {} } = body;

    const suite = await getTestSuite();

    if (action === 'custom-test') {
      // Run test with custom configuration
      const {
        systems = ['ml', 'lstm', 'or-tools', 'integrated'],
        scenarios = ['Medium Scale Test'],
        include_benchmarks = false
      } = config;

      console.log(`🧪 Running custom test: systems=${systems.join(',')}, scenarios=${scenarios.join(',')}`);

      const results = [];

      for (const scenario of scenarios) {
        for (const system of systems) {
          try {
            const result = await suite.testSpecificSystem(system, scenario);
            results.push({
              system,
              scenario,
              result
            });
          } catch (error) {
            results.push({
              system,
              scenario,
              result: {
                scenario_name: scenario,
                timestamp: new Date(),
                execution_time: 0,
                results: {},
                overall_status: 'failed',
                issues: [`Test failed: ${error}`],
                recommendations: ['Check system configuration']
              }
            });
          }
        }
      }

      let benchmarks = null;
      if (include_benchmarks) {
        try {
          benchmarks = await suite.runPerformanceBenchmarks();
        } catch (error) {
          console.log('Benchmarks failed:', error);
        }
      }

      const summary = {
        total_tests: results.length,
        passed: results.filter(r => r.result.overall_status === 'passed').length,
        failed: results.filter(r => r.result.overall_status === 'failed').length,
        warnings: results.filter(r => r.result.overall_status === 'warning').length
      };

      return NextResponse.json({
        success: true,
        data: {
          summary,
          results,
          benchmarks
        },
        message: `Custom test completed: ${summary.passed}/${summary.total_tests} tests passed`
      });

    } else if (action === 'stress-test') {
      // Stress test specific system
      const { system = 'integrated', iterations = 5 } = config;
      
      console.log(`💪 Running stress test on ${system} system with ${iterations} iterations...`);

      const results = [];
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        try {
          const result = await suite.testSpecificSystem(system, 'Large Scale Test');
          const executionTime = Date.now() - start;
          times.push(executionTime);
          results.push({
            iteration: i + 1,
            result,
            execution_time: executionTime
          });
        } catch (error) {
          results.push({
            iteration: i + 1,
            result: {
              scenario_name: 'Stress Test',
              timestamp: new Date(),
              execution_time: Date.now() - start,
              results: {},
              overall_status: 'failed',
              issues: [`Iteration ${i + 1} failed: ${error}`],
              recommendations: ['Check system stability under load']
            },
            execution_time: Date.now() - start
          });
        }
      }

      const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const maxTime = times.length > 0 ? Math.max(...times) : 0;
      const minTime = times.length > 0 ? Math.min(...times) : 0;

      const stressTestSummary = {
        iterations_completed: results.length,
        successful_iterations: results.filter(r => r.result.overall_status === 'passed').length,
        average_time: avgTime,
        min_time: minTime,
        max_time: maxTime,
        performance_stable: maxTime - minTime < avgTime * 0.5 // Performance is stable if variance is low
      };

      return NextResponse.json({
        success: true,
        data: {
          summary: stressTestSummary,
          results
        },
        message: `Stress test completed: ${stressTestSummary.successful_iterations}/${stressTestSummary.iterations_completed} iterations successful`
      });

    } else if (action === 'validate-accuracy') {
      // Validate prediction accuracy against historical data
      // This would require historical data with known outcomes
      return NextResponse.json({
        success: false,
        error: 'Accuracy validation requires historical data with known outcomes',
        suggestion: 'Implement this feature when you have sufficient historical prediction data to compare against actual outcomes'
      }, { status: 501 });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid action. Use: custom-test, stress-test, or validate-accuracy'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in prediction testing POST:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}