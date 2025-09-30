import { MLSuggestionEngine } from '../ml/enhancedSuggestions';
import { LSTMPredictionService, EmptyContainerPrediction } from '../ml/lstmPredictionService';
import { ORToolsService, OptimizationResult } from '../optimization/orToolsService';
import { IntegratedOptimizationEngine, IntegratedOptimization } from '../ml/integratedOptimizationEngine';
import { SystemContext } from '../ml/types';

export interface TestScenario {
  name: string;
  description: string;
  context: SystemContext;
  expectedOutcomes: {
    ml_suggestions_count?: number;
    lstm_predictions_count?: number;
    or_tools_success?: boolean;
    integrated_recommendations_count?: number;
  };
  validation_criteria: {
    min_confidence?: number;
    max_execution_time?: number; // milliseconds
    required_accuracy?: number;
  };
}

export interface TestResult {
  scenario_name: string;
  timestamp: Date;
  execution_time: number;
  results: {
    ml_test?: MLTestResult;
    lstm_test?: LSTMTestResult;
    or_tools_test?: ORToolsTestResult;
    integrated_test?: IntegratedTestResult;
  };
  overall_status: 'passed' | 'failed' | 'warning';
  issues: string[];
  recommendations: string[];
}

export interface MLTestResult {
  suggestions_generated: number;
  average_confidence: number;
  execution_time: number;
  status: 'passed' | 'failed';
  issues: string[];
}

export interface LSTMTestResult {
  predictions_generated: number;
  average_confidence: number;
  prediction_range: { min: number; max: number };
  execution_time: number;
  status: 'passed' | 'failed';
  issues: string[];
}

export interface ORToolsTestResult {
  optimization_status: string;
  total_cost?: number;
  relocations_suggested: number;
  execution_time: number;
  python_available: boolean;
  status: 'passed' | 'failed';
  issues: string[];
}

export interface IntegratedTestResult {
  recommendations_generated: number;
  confidence_score: number;
  services_used: string[];
  estimated_roi: number;
  execution_time: number;
  status: 'passed' | 'failed';
  issues: string[];
}

export class PredictionTestSuite {
  private mlEngine: MLSuggestionEngine;
  private lstmService: LSTMPredictionService;
  private orToolsService: ORToolsService;
  private integratedEngine: IntegratedOptimizationEngine;
  private testScenarios: TestScenario[] = [];

  constructor() {
    this.mlEngine = new MLSuggestionEngine();
    this.lstmService = new LSTMPredictionService();
    this.orToolsService = new ORToolsService();
    this.integratedEngine = new IntegratedOptimizationEngine();
    this.initializeTestScenarios();
  }

  /**
   * Run all prediction tests
   */
  async runCompleteTestSuite(): Promise<{
    summary: {
      total_tests: number;
      passed: number;
      failed: number;
      warnings: number;
      total_execution_time: number;
    };
    results: TestResult[];
    recommendations: string[];
  }> {
    console.log('🧪 Starting Complete Prediction Test Suite...');
    const startTime = Date.now();
    
    const results: TestResult[] = [];
    let passed = 0, failed = 0, warnings = 0;

    // Initialize all services
    try {
      await this.initializeServices();
    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
      return {
        summary: {
          total_tests: 0,
          passed: 0,
          failed: 1,
          warnings: 0,
          total_execution_time: Date.now() - startTime
        },
        results: [{
          scenario_name: 'Service Initialization',
          timestamp: new Date(),
          execution_time: Date.now() - startTime,
          results: {},
          overall_status: 'failed',
          issues: [`Service initialization failed: ${error}`],
          recommendations: ['Check service dependencies and configurations']
        }],
        recommendations: ['Fix service initialization before running tests']
      };
    }

    // Run tests for each scenario
    for (const scenario of this.testScenarios) {
      console.log(`   📋 Testing scenario: ${scenario.name}`);
      
      try {
        const result = await this.runSingleTest(scenario);
        results.push(result);
        
        if (result.overall_status === 'passed') passed++;
        else if (result.overall_status === 'failed') failed++;
        else warnings++;

      } catch (error) {
        console.error(`❌ Test scenario ${scenario.name} threw exception:`, error);
        failed++;
        
        results.push({
          scenario_name: scenario.name,
          timestamp: new Date(),
          execution_time: 0,
          results: {},
          overall_status: 'failed',
          issues: [`Test threw exception: ${error}`],
          recommendations: ['Debug test scenario implementation']
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const recommendations = this.generateTestRecommendations(results);

    console.log(`✅ Test Suite Complete: ${passed} passed, ${failed} failed, ${warnings} warnings`);

    return {
      summary: {
        total_tests: this.testScenarios.length,
        passed,
        failed, 
        warnings,
        total_execution_time: totalTime
      },
      results,
      recommendations
    };
  }

  /**
   * Test specific prediction system
   */
  async testSpecificSystem(
    system: 'ml' | 'lstm' | 'or-tools' | 'integrated',
    scenarioName?: string
  ): Promise<TestResult> {
    await this.initializeServices();

    const scenario = scenarioName 
      ? this.testScenarios.find(s => s.name === scenarioName)
      : this.testScenarios[0]; // Default scenario

    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioName}`);
    }

    console.log(`🔬 Testing ${system.toUpperCase()} system with scenario: ${scenario.name}`);

    const result: TestResult = {
      scenario_name: scenario.name,
      timestamp: new Date(),
      execution_time: 0,
      results: {},
      overall_status: 'passed',
      issues: [],
      recommendations: []
    };

    const startTime = Date.now();

    try {
      if (system === 'ml') {
        result.results.ml_test = await this.testMLSystem(scenario);
      } else if (system === 'lstm') {
        result.results.lstm_test = await this.testLSTMSystem(scenario);
      } else if (system === 'or-tools') {
        result.results.or_tools_test = await this.testORToolsSystem(scenario);
      } else if (system === 'integrated') {
        result.results.integrated_test = await this.testIntegratedSystem(scenario);
      }

      result.execution_time = Date.now() - startTime;
      
      // Determine overall status
      const testResult = Object.values(result.results)[0];
      result.overall_status = testResult?.status || 'failed';
      result.issues = testResult?.issues || [];

    } catch (error) {
      result.execution_time = Date.now() - startTime;
      result.overall_status = 'failed';
      result.issues.push(`Test failed: ${error}`);
    }

    return result;
  }

  /**
   * Run performance benchmarks
   */
  async runPerformanceBenchmarks(): Promise<{
    ml_performance: { avg_time: number; suggestions_per_second: number };
    lstm_performance: { avg_time: number; predictions_per_second: number };
    or_tools_performance: { avg_time: number; optimizations_per_minute: number };
    integrated_performance: { avg_time: number; recommendations_per_second: number };
  }> {
    console.log('⚡ Running Performance Benchmarks...');
    await this.initializeServices();

    const testContext = this.generateTestContext('medium');
    const iterations = 5;

    // ML Performance
    console.log('   📊 ML Performance...');
    const mlTimes: number[] = [];
    let totalMLSuggestions = 0;
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      const suggestions = await this.mlEngine.generateSmartSuggestions(testContext);
      mlTimes.push(Date.now() - start);
      totalMLSuggestions += suggestions.length;
    }

    const mlAvgTime = mlTimes.reduce((a, b) => a + b, 0) / mlTimes.length;
    const mlSuggestionsPerSecond = (totalMLSuggestions / (mlAvgTime / 1000)) / iterations;

    // LSTM Performance
    console.log('   🔮 LSTM Performance...');
    const lstmTimes: number[] = [];
    let totalLSTMPredictions = 0;

    for (let i = 0; i < Math.min(iterations, 3); i++) { // LSTM is slower
      try {
        const start = Date.now();
        const predictions = await this.lstmService.getPredictions(testContext.bookings || [], 7);
        lstmTimes.push(Date.now() - start);
        totalLSTMPredictions += predictions.length;
      } catch (error) {
        console.log('   ⚠️  LSTM not available for benchmarking');
        break;
      }
    }

    const lstmAvgTime = lstmTimes.length > 0 
      ? lstmTimes.reduce((a, b) => a + b, 0) / lstmTimes.length 
      : 0;
    const lstmPredictionsPerSecond = lstmTimes.length > 0
      ? (totalLSTMPredictions / (lstmAvgTime / 1000)) / lstmTimes.length
      : 0;

    // OR-Tools Performance
    console.log('   🎯 OR-Tools Performance...');
    const orToolsTimes: number[] = [];
    let totalORToolsOptimizations = 0;

    for (let i = 0; i < Math.min(iterations, 2); i++) { // OR-Tools is slowest
      try {
        const start = Date.now();
        await this.runORToolsTest(testContext, 'quick');
        orToolsTimes.push(Date.now() - start);
        totalORToolsOptimizations++;
      } catch (error) {
        console.log('   ⚠️  OR-Tools not available for benchmarking');
        break;
      }
    }

    const orToolsAvgTime = orToolsTimes.length > 0
      ? orToolsTimes.reduce((a, b) => a + b, 0) / orToolsTimes.length
      : 0;
    const orToolsOptimizationsPerMinute = orToolsTimes.length > 0
      ? (totalORToolsOptimizations / (orToolsAvgTime / 60000)) / orToolsTimes.length
      : 0;

    // Integrated Performance
    console.log('   🤖 Integrated Performance...');
    const integratedTimes: number[] = [];
    let totalIntegratedRecommendations = 0;

    for (let i = 0; i < Math.min(iterations, 2); i++) {
      try {
        const start = Date.now();
        const result = await this.integratedEngine.runIntegratedOptimization(testContext, {
          include_or_tools: false, // Faster test
          optimization_horizon: 3
        });
        integratedTimes.push(Date.now() - start);
        totalIntegratedRecommendations += result.integrated_recommendations.length;
      } catch (error) {
        console.log('   ⚠️  Integrated system error in benchmark');
        break;
      }
    }

    const integratedAvgTime = integratedTimes.length > 0
      ? integratedTimes.reduce((a, b) => a + b, 0) / integratedTimes.length
      : 0;
    const integratedRecommendationsPerSecond = integratedTimes.length > 0
      ? (totalIntegratedRecommendations / (integratedAvgTime / 1000)) / integratedTimes.length
      : 0;

    console.log('✅ Performance Benchmarks Complete');

    return {
      ml_performance: {
        avg_time: mlAvgTime,
        suggestions_per_second: mlSuggestionsPerSecond
      },
      lstm_performance: {
        avg_time: lstmAvgTime,
        predictions_per_second: lstmPredictionsPerSecond
      },
      or_tools_performance: {
        avg_time: orToolsAvgTime,
        optimizations_per_minute: orToolsOptimizationsPerMinute
      },
      integrated_performance: {
        avg_time: integratedAvgTime,
        recommendations_per_second: integratedRecommendationsPerSecond
      }
    };
  }

  private async initializeServices(): Promise<void> {
    console.log('🔧 Initializing services for testing...');
    
    try {
      await Promise.all([
        this.mlEngine.initialize(),
        this.lstmService.initialize(),
        this.orToolsService.initialize(),
        this.integratedEngine.initialize()
      ]);
    } catch (error) {
      // Some services might fail - that's okay for testing
      console.log('⚠️  Some services failed to initialize (this is normal for testing)');
    }
  }

  private async runSingleTest(scenario: TestScenario): Promise<TestResult> {
    const result: TestResult = {
      scenario_name: scenario.name,
      timestamp: new Date(),
      execution_time: 0,
      results: {},
      overall_status: 'passed',
      issues: [],
      recommendations: []
    };

    const startTime = Date.now();

    try {
      // Test all systems
      const [mlTest, lstmTest, orToolsTest, integratedTest] = await Promise.allSettled([
        this.testMLSystem(scenario),
        this.testLSTMSystem(scenario),
        this.testORToolsSystem(scenario),
        this.testIntegratedSystem(scenario)
      ]);

      // Collect results
      if (mlTest.status === 'fulfilled') result.results.ml_test = mlTest.value;
      if (lstmTest.status === 'fulfilled') result.results.lstm_test = lstmTest.value;
      if (orToolsTest.status === 'fulfilled') result.results.or_tools_test = orToolsTest.value;
      if (integratedTest.status === 'fulfilled') result.results.integrated_test = integratedTest.value;

      // Collect issues from all tests
      Object.values(result.results).forEach(testResult => {
        if (testResult && testResult.status === 'failed') {
          result.issues.push(...testResult.issues);
        }
      });

      // Determine overall status
      const testResults = Object.values(result.results).filter(Boolean);
      const failedTests = testResults.filter(t => t?.status === 'failed');
      
      if (failedTests.length === testResults.length) {
        result.overall_status = 'failed';
      } else if (failedTests.length > 0) {
        result.overall_status = 'warning';
      } else {
        result.overall_status = 'passed';
      }

    } catch (error) {
      result.overall_status = 'failed';
      result.issues.push(`Test scenario failed: ${error}`);
    }

    result.execution_time = Date.now() - startTime;
    return result;
  }

  private async testMLSystem(scenario: TestScenario): Promise<MLTestResult> {
    const startTime = Date.now();
    
    try {
      const suggestions = await this.mlEngine.generateSmartSuggestions(scenario.context);
      const avgConfidence = suggestions.length > 0 
        ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length 
        : 0;

      const issues: string[] = [];
      
      // Validate against expected outcomes
      if (scenario.expectedOutcomes.ml_suggestions_count && 
          suggestions.length < scenario.expectedOutcomes.ml_suggestions_count) {
        issues.push(`Expected ${scenario.expectedOutcomes.ml_suggestions_count} suggestions, got ${suggestions.length}`);
      }

      if (scenario.validation_criteria.min_confidence && 
          avgConfidence < scenario.validation_criteria.min_confidence) {
        issues.push(`Average confidence ${avgConfidence.toFixed(2)} below minimum ${scenario.validation_criteria.min_confidence}`);
      }

      return {
        suggestions_generated: suggestions.length,
        average_confidence: avgConfidence,
        execution_time: Date.now() - startTime,
        status: issues.length === 0 ? 'passed' : 'failed',
        issues
      };

    } catch (error) {
      return {
        suggestions_generated: 0,
        average_confidence: 0,
        execution_time: Date.now() - startTime,
        status: 'failed',
        issues: [`ML system error: ${error}`]
      };
    }
  }

  private async testLSTMSystem(scenario: TestScenario): Promise<LSTMTestResult> {
    const startTime = Date.now();
    
    try {
      if (!scenario.context.bookings || scenario.context.bookings.length < 30) {
        return {
          predictions_generated: 0,
          average_confidence: 0,
          prediction_range: { min: 0, max: 0 },
          execution_time: Date.now() - startTime,
          status: 'failed',
          issues: ['Insufficient booking data for LSTM testing (need 30+ bookings)']
        };
      }

      const predictions = await this.lstmService.getPredictions(scenario.context.bookings, 7);
      const avgConfidence = predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
        : 0;

      const predictionValues = predictions.map(p => p.predictedEmptyCount);
      const predictionRange = {
        min: Math.min(...predictionValues, 0),
        max: Math.max(...predictionValues, 0)
      };

      const issues: string[] = [];
      
      if (scenario.expectedOutcomes.lstm_predictions_count &&
          predictions.length < scenario.expectedOutcomes.lstm_predictions_count) {
        issues.push(`Expected ${scenario.expectedOutcomes.lstm_predictions_count} predictions, got ${predictions.length}`);
      }

      if (avgConfidence < 0.5) {
        issues.push(`Low prediction confidence: ${avgConfidence.toFixed(2)}`);
      }

      return {
        predictions_generated: predictions.length,
        average_confidence: avgConfidence,
        prediction_range: predictionRange,
        execution_time: Date.now() - startTime,
        status: issues.length === 0 ? 'passed' : 'failed',
        issues
      };

    } catch (error) {
      return {
        predictions_generated: 0,
        average_confidence: 0,
        prediction_range: { min: 0, max: 0 },
        execution_time: Date.now() - startTime,
        status: 'failed',
        issues: [`LSTM system error: ${error}`]
      };
    }
  }

  private async testORToolsSystem(scenario: TestScenario): Promise<ORToolsTestResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.runORToolsTest(scenario.context, 'comprehensive');
      
      const issues: string[] = [];
      const relocationsCount = 'relocations' in result && result.relocations 
        ? result.relocations.length 
        : 0;

      if (result.status === 'error') {
        issues.push(`OR-Tools optimization failed: ${result.error}`);
      }

      if (scenario.expectedOutcomes.or_tools_success && result.status !== 'optimal') {
        issues.push(`Expected optimal solution, got: ${result.status}`);
      }

      return {
        optimization_status: result.status || 'unknown',
        total_cost: result.total_cost,
        relocations_suggested: relocationsCount,
        execution_time: Date.now() - startTime,
        python_available: result.status !== 'error' || !result.error?.includes('Python'),
        status: issues.length === 0 && result.status !== 'error' ? 'passed' : 'failed',
        issues
      };

    } catch (error) {
      return {
        optimization_status: 'error',
        relocations_suggested: 0,
        execution_time: Date.now() - startTime,
        python_available: false,
        status: 'failed',
        issues: [`OR-Tools test error: ${error}`]
      };
    }
  }

  private async testIntegratedSystem(scenario: TestScenario): Promise<IntegratedTestResult> {
    const startTime = Date.now();
    
    try {
      const result = await this.integratedEngine.runIntegratedOptimization(scenario.context, {
        include_or_tools: true,
        optimization_horizon: 5,
        max_execution_time: 60
      });

      const issues: string[] = [];

      if (scenario.expectedOutcomes.integrated_recommendations_count &&
          result.integrated_recommendations.length < scenario.expectedOutcomes.integrated_recommendations_count) {
        issues.push(`Expected ${scenario.expectedOutcomes.integrated_recommendations_count} recommendations, got ${result.integrated_recommendations.length}`);
      }

      if (result.confidence_score < 0.6) {
        issues.push(`Low integrated confidence score: ${result.confidence_score.toFixed(2)}`);
      }

      return {
        recommendations_generated: result.integrated_recommendations.length,
        confidence_score: result.confidence_score,
        services_used: result.execution_summary.services_used,
        estimated_roi: result.execution_summary.estimated_roi,
        execution_time: Date.now() - startTime,
        status: issues.length === 0 ? 'passed' : 'failed',
        issues
      };

    } catch (error) {
      return {
        recommendations_generated: 0,
        confidence_score: 0,
        services_used: [],
        estimated_roi: 0,
        execution_time: Date.now() - startTime,
        status: 'failed',
        issues: [`Integrated system error: ${error}`]
      };
    }
  }

  private async runORToolsTest(context: SystemContext, type: 'quick' | 'comprehensive'): Promise<any> {
    // Convert context to OR-Tools format
    const ports = context.inventory.slice(0, 5).map((inv, i) => ({
      name: inv.port,
      current_empty: Math.floor(inv.stock * 0.3),
      capacity: inv.stock * 2,
      lstm_forecast: Array(7).fill(5 + i * 2),
      storage_cost: 2.0 + i * 0.5,
      handling_cost: 5.0,
      lat: i * 10,
      lng: i * 10
    }));

    const containers = (context.bookings || [])
      .filter(b => b.emptyLaden?.toLowerCase().includes('empty'))
      .slice(0, 20)
      .map((b, i) => ({
        id: `TEST_${i}`,
        type: b.size || '20GP',
        current_port: b.origin,
        dwell_time: 5 + i,
        priority: 5 + (i % 5)
      }));

    const routes = ports.flatMap(from => 
      ports.filter(to => to.name !== from.name).slice(0, 2).map(to => ({
        from: from.name,
        to: to.name,
        distance: 100 + Math.random() * 200,
        cost: 50 + Math.random() * 50,
        transit_time: 24,
        capacity: 30
      }))
    );

    if (type === 'comprehensive' && ports.length > 0 && containers.length > 0) {
      return await this.orToolsService.optimizeComprehensive(ports, containers, routes, []);
    } else if (ports.length > 0 && containers.length > 0) {
      return await this.orToolsService.optimizeRedistribution(ports, containers, routes);
    } else {
      return { status: 'error', error: 'Insufficient test data' };
    }
  }

  private initializeTestScenarios(): void {
    this.testScenarios = [
      {
        name: 'Small Scale Test',
        description: 'Test with minimal data to verify basic functionality',
        context: this.generateTestContext('small'),
        expectedOutcomes: {
          ml_suggestions_count: 2,
          lstm_predictions_count: 0, // May not work with small data
          or_tools_success: true,
          integrated_recommendations_count: 1
        },
        validation_criteria: {
          min_confidence: 0.5,
          max_execution_time: 30000,
          required_accuracy: 0.7
        }
      },
      {
        name: 'Medium Scale Test',
        description: 'Test with realistic data volumes',
        context: this.generateTestContext('medium'),
        expectedOutcomes: {
          ml_suggestions_count: 5,
          lstm_predictions_count: 3,
          or_tools_success: true,
          integrated_recommendations_count: 4
        },
        validation_criteria: {
          min_confidence: 0.6,
          max_execution_time: 60000,
          required_accuracy: 0.75
        }
      },
      {
        name: 'Large Scale Test',
        description: 'Test with high data volumes to check performance',
        context: this.generateTestContext('large'),
        expectedOutcomes: {
          ml_suggestions_count: 8,
          lstm_predictions_count: 5,
          or_tools_success: true,
          integrated_recommendations_count: 6
        },
        validation_criteria: {
          min_confidence: 0.7,
          max_execution_time: 120000,
          required_accuracy: 0.8
        }
      },
      {
        name: 'Edge Case Test',
        description: 'Test with edge cases and unusual data patterns',
        context: this.generateTestContext('edge_case'),
        expectedOutcomes: {
          ml_suggestions_count: 1,
          or_tools_success: false, // May fail with edge cases
          integrated_recommendations_count: 1
        },
        validation_criteria: {
          min_confidence: 0.3,
          max_execution_time: 45000,
          required_accuracy: 0.6
        }
      }
    ];
  }

  private generateTestContext(scale: 'small' | 'medium' | 'large' | 'edge_case'): SystemContext {
    const baseDate = new Date();
    
    const scaleConfig = {
      small: { ports: 3, bookings: 20, proposals: 5 },
      medium: { ports: 8, bookings: 100, proposals: 15 },
      large: { ports: 15, bookings: 500, proposals: 50 },
      edge_case: { ports: 2, bookings: 5, proposals: 1 }
    };

    const config = scaleConfig[scale];

    // Generate test inventory
    const inventory = Array.from({ length: config.ports }, (_, i) => ({
      id: i + 1,
      port: `TEST_PORT_${String.fromCharCode(65 + i)}`,
      type: ['20GP', '40GP', '40HC'][i % 3],
      stock: scale === 'edge_case' ? (i === 0 ? 0 : 1000) : 50 + i * 20
    }));

    // Generate test bookings
    const bookings = Array.from({ length: config.bookings }, (_, i) => {
      const daysAgo = Math.floor(Math.random() * 60);
      const bookingDate = new Date(baseDate.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      
      return {
        id: i + 1,
        date: bookingDate,
        origin: inventory[i % inventory.length].port,
        destination: inventory[(i + 1) % inventory.length].port,
        size: ['20GP', '40GP', '40HC'][i % 3],
        qty: 1 + Math.floor(Math.random() * 5),
        customer: `CUSTOMER_${i % 10}`,
        status: ['completed', 'pending', 'draft'][i % 3],
        containerNo: `CONT${i.toString().padStart(6, '0')}`,
        emptyLaden: i % 3 === 0 ? 'Empty' : 'Laden',
        depot: inventory[i % inventory.length].port,
        optimizationSuggestion: `Test optimization ${i}`,
        optimizationScore: 50 + Math.floor(Math.random() * 50),
        optimizationType: ['standard', 'urgent-relocation', 'efficiency'][i % 3]
      };
    });

    // Generate test proposals
    const proposals = Array.from({ length: config.proposals }, (_, i) => ({
      id: `PROP_${i.toString().padStart(3, '0')}`,
      route: `${inventory[i % inventory.length].port}-${inventory[(i + 1) % inventory.length].port}`,
      size: ['20GP', '40GP', '40HC'][i % 3],
      qty: 5 + Math.floor(Math.random() * 20),
      estCost: 1000 + Math.random() * 2000,
      benefit: 500 + Math.random() * 1000,
      reason: `Test proposal reason ${i}`,
      status: ['draft', 'pending', 'approved'][i % 3],
      createdAt: new Date(baseDate.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000)
    }));

    // Generate test KPI
    const kpi = {
      id: 1,
      utilization: `${70 + Math.floor(Math.random() * 25)}%`,
      storageCost: `$${(5000 + Math.random() * 3000).toFixed(2)}`,
      dwellTime: `${(2 + Math.random() * 4).toFixed(1)} days`,
      approvalRate: `${75 + Math.floor(Math.random() * 20)}%`
    };

    // Generate test alerts
    const alerts = Array.from({ length: Math.floor(config.proposals / 3) }, (_, i) => ({
      id: `ALERT_${i}`,
      level: ['info', 'warning', 'critical'][i % 3],
      message: `Test alert message ${i}`,
      location: inventory[i % inventory.length].port,
      severity: ['low', 'medium', 'high'][i % 3],
      description: `Test alert description ${i}`,
      status: 'active',
      createdAt: new Date(baseDate.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000),
      resolvedAt: null
    }));

    return {
      kpi,
      inventory,
      proposals,
      alerts,
      bookings
    };
  }

  private generateTestRecommendations(results: TestResult[]): string[] {
    const recommendations: string[] = [];
    
    const failedTests = results.filter(r => r.overall_status === 'failed');
    const warningTests = results.filter(r => r.overall_status === 'warning');

    if (failedTests.length > 0) {
      recommendations.push(`🔧 ${failedTests.length} tests failed - review system configurations`);
    }

    if (warningTests.length > 0) {
      recommendations.push(`⚠️ ${warningTests.length} tests have warnings - monitor system performance`);
    }

    // Service-specific recommendations
    const mlFailures = results.filter(r => r.results.ml_test?.status === 'failed').length;
    const lstmFailures = results.filter(r => r.results.lstm_test?.status === 'failed').length;
    const orToolsFailures = results.filter(r => r.results.or_tools_test?.status === 'failed').length;

    if (mlFailures > 0) {
      recommendations.push('🧠 ML System needs attention - check training data and configurations');
    }

    if (lstmFailures > 0) {
      recommendations.push('🔮 LSTM System issues detected - verify training data and model status');
    }

    if (orToolsFailures > 0) {
      recommendations.push('🎯 OR-Tools integration problems - check Python environment and dependencies');
    }

    // Performance recommendations
    const slowTests = results.filter(r => r.execution_time > 60000);
    if (slowTests.length > 0) {
      recommendations.push('⚡ Performance optimization needed - some tests exceed 60s execution time');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All systems performing well - continue monitoring and regular testing');
    }

    return recommendations;
  }
}