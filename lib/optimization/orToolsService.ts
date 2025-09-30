import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface OptimizationInput {
  optimization_type: 'redistribution' | 'routing' | 'assignment';
  ports: PortData[];
  containers: ContainerData[];
  routes: RouteData[];
  relocations?: RelocationData[];
  demands?: DemandData[];
  lstm_predictions?: LSTMPrediction[];
}

export interface PortData {
  name: string;
  current_empty: number;
  capacity: number;
  lstm_forecast: number[];
  storage_cost: number;
  handling_cost: number;
  lat: number;
  lng: number;
}

export interface ContainerData {
  id: string;
  type: string;
  current_port: string;
  dwell_time: number;
  next_booking_port?: string;
  priority: number;
}

export interface RouteData {
  from: string;
  to: string;
  distance: number;
  cost: number;
  transit_time: number;
  capacity: number;
}

export interface RelocationData {
  from_port: string;
  to_port: string;
  container_count: number;
  urgency: 'high' | 'medium' | 'low';
}

export interface DemandData {
  id: string;
  port: string;
  required_type: string;
  quantity: number;
  priority: number;
  deadline: Date;
}

export interface LSTMPrediction {
  port: string;
  container_type: string;
  predictions: number[];
  confidence: number[];
}

export interface OptimizationResult {
  status: 'optimal' | 'fallback' | 'error';
  total_cost?: number;
  relocations?: Array<{
    from_port: string;
    to_port: string;
    container_type: string;
    quantity: number;
    day: number;
    priority: string;
  }>;
  storage_plan?: { [port: string]: { [type: string]: number[] } };
  assignments?: Array<{
    container_id: string;
    demand_id: string;
    from_port: string;
    to_port: string;
    container_type: string;
    cost: number;
  }>;
  routes?: Array<{
    stops: RelocationData[];
    total_distance: number;
  }>;
  recommendations: string[];
  error?: string;
  execution_time?: number;
  python_logs?: string;
}

export class ORToolsService {
  private pythonPath: string;
  private scriptPath: string;
  private tempDir: string;
  private isInitialized: boolean = false;
  private initializationError: string | null = null;

  constructor() {
    this.pythonPath = 'python'; // Will try to find Python in PATH
    this.scriptPath = path.join(process.cwd(), 'python_optimization', 'container_optimizer.py');
    this.tempDir = os.tmpdir();
  }

  /**
   * Initialize the OR-Tools service and verify Python environment
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing OR-Tools Python service...');

      // Check if Python is available
      await this.verifyPythonEnvironment();

      // Check if script exists
      if (!fs.existsSync(this.scriptPath)) {
        throw new Error(`Python optimization script not found: ${this.scriptPath}`);
      }

      // Test basic functionality
      await this.testOptimizationService();

      this.isInitialized = true;
      console.log('✅ OR-Tools service initialized successfully');

    } catch (error) {
      this.initializationError = error instanceof Error ? error.message : 'Unknown initialization error';
      console.error('❌ OR-Tools initialization failed:', this.initializationError);
      throw error;
    }
  }

  /**
   * Run container redistribution optimization
   */
  async optimizeRedistribution(
    ports: PortData[],
    containers: ContainerData[],
    routes: RouteData[],
    lstmPredictions?: LSTMPrediction[]
  ): Promise<OptimizationResult> {
    const input: OptimizationInput = {
      optimization_type: 'redistribution',
      ports: this.enhancePortsWithLSTM(ports, lstmPredictions),
      containers,
      routes,
      lstm_predictions: lstmPredictions
    };

    return this.runOptimization(input);
  }

  /**
   * Run vehicle routing optimization
   */
  async optimizeRouting(
    relocations: RelocationData[],
    routes: RouteData[]
  ): Promise<OptimizationResult> {
    const input: OptimizationInput = {
      optimization_type: 'routing',
      ports: [], // Not needed for routing
      containers: [], // Not needed for routing
      routes,
      relocations
    };

    return this.runOptimization(input);
  }

  /**
   * Run container-demand assignment optimization
   */
  async optimizeAssignment(
    containers: ContainerData[],
    demands: DemandData[],
    routes: RouteData[]
  ): Promise<OptimizationResult> {
    const input: OptimizationInput = {
      optimization_type: 'assignment',
      ports: [], // Not needed for assignment
      containers,
      routes,
      demands
    };

    return this.runOptimization(input);
  }

  /**
   * Run comprehensive optimization combining all methods
   */
  async optimizeComprehensive(
    ports: PortData[],
    containers: ContainerData[],
    routes: RouteData[],
    demands: DemandData[],
    lstmPredictions?: LSTMPrediction[]
  ): Promise<{
    redistribution: OptimizationResult;
    assignment: OptimizationResult;
    routing?: OptimizationResult;
    combined_recommendations: string[];
    total_estimated_cost: number;
  }> {
    try {
      console.log('🚀 Running comprehensive OR-Tools optimization...');
      const startTime = Date.now();

      // Step 1: Container redistribution optimization
      console.log('   📦 Step 1: Container redistribution...');
      const redistribution = await this.optimizeRedistribution(ports, containers, routes, lstmPredictions);

      // Step 2: Container-demand assignment
      console.log('   🎯 Step 2: Container assignment...');
      const assignment = await this.optimizeAssignment(containers, demands, routes);

      // Step 3: Vehicle routing for identified relocations
      let routing: OptimizationResult | undefined;
      if (redistribution.relocations && redistribution.relocations.length > 0) {
        console.log('   🚛 Step 3: Vehicle routing...');
        const relocations: RelocationData[] = redistribution.relocations.map(r => ({
          from_port: r.from_port,
          to_port: r.to_port,
          container_count: r.quantity,
          urgency: r.priority as 'high' | 'medium' | 'low'
        }));
        
        routing = await this.optimizeRouting(relocations, routes);
      }

      // Combine results
      const totalCost = (redistribution.total_cost || 0) + (assignment.total_cost || 0);
      const combinedRecommendations = [
        '🧠 OR-Tools Comprehensive Optimization Complete',
        `💰 Total Estimated Cost: $${totalCost.toLocaleString()}`,
        `⏱️ Execution Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
        ...redistribution.recommendations,
        ...assignment.recommendations,
        ...(routing?.recommendations || [])
      ];

      console.log('✅ Comprehensive optimization completed');

      return {
        redistribution,
        assignment,
        routing,
        combined_recommendations: combinedRecommendations,
        total_estimated_cost: totalCost
      };

    } catch (error) {
      console.error('❌ Comprehensive optimization failed:', error);
      throw error;
    }
  }

  private async runOptimization(input: OptimizationInput): Promise<OptimizationResult> {
    if (!this.isInitialized) {
      if (this.initializationError) {
        return {
          status: 'error',
          error: `OR-Tools not initialized: ${this.initializationError}`,
          recommendations: ['Initialize OR-Tools service before running optimizations']
        };
      }
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      // Create temporary input file
      const inputFile = path.join(this.tempDir, `optimization_input_${Date.now()}.json`);
      fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));

      // Run Python optimization
      const result = await this.executePythonScript(inputFile);
      
      // Cleanup temporary file
      fs.unlinkSync(inputFile);

      // Add execution time
      result.execution_time = Date.now() - startTime;

      console.log(`✅ OR-Tools optimization completed in ${result.execution_time}ms`);
      return result;

    } catch (error) {
      console.error('❌ OR-Tools optimization error:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown optimization error',
        recommendations: ['Check Python environment and OR-Tools installation'],
        execution_time: Date.now() - startTime
      };
    }
  }

  private async executePythonScript(inputFile: string): Promise<OptimizationResult> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.pythonPath, [this.scriptPath, inputFile]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            result.python_logs = stderr;
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python output: ${parseError}`));
          }
        } else {
          reject(new Error(`Python script exited with code ${code}. Error: ${stderr}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Python optimization timeout (60s)'));
      }, 60000);
    });
  }

  private async verifyPythonEnvironment(): Promise<void> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(this.pythonPath, ['--version']);
      
      let output = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Python version: ${output.trim()}`);
          resolve();
        } else {
          reject(new Error(`Python not found or not working. Install Python 3.8+`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        reject(new Error(`Python not found in PATH: ${error.message}`));
      });
    });
  }

  private async testOptimizationService(): Promise<void> {
    // Create minimal test data
    const testInput: OptimizationInput = {
      optimization_type: 'redistribution',
      ports: [
        {
          name: 'TEST_PORT_A',
          current_empty: 10,
          capacity: 100,
          lstm_forecast: [5, 3, 2, 4, 6, 8, 7],
          storage_cost: 1.0,
          handling_cost: 2.0,
          lat: 0,
          lng: 0
        },
        {
          name: 'TEST_PORT_B',
          current_empty: 2,
          capacity: 50,
          lstm_forecast: [8, 9, 10, 12, 15, 10, 8],
          storage_cost: 1.5,
          handling_cost: 2.5,
          lat: 1,
          lng: 1
        }
      ],
      containers: [
        {
          id: 'TEST_001',
          type: '20GP',
          current_port: 'TEST_PORT_A',
          dwell_time: 5,
          priority: 8
        }
      ],
      routes: [
        {
          from: 'TEST_PORT_A',
          to: 'TEST_PORT_B',
          distance: 100,
          cost: 50,
          transit_time: 24,
          capacity: 20
        }
      ]
    };

    const inputFile = path.join(this.tempDir, `test_input_${Date.now()}.json`);
    
    try {
      fs.writeFileSync(inputFile, JSON.stringify(testInput, null, 2));
      const result = await this.executePythonScript(inputFile);
      
      if (result.status === 'error') {
        throw new Error(`Test optimization failed: ${result.error}`);
      }
      
      console.log('✅ OR-Tools service test passed');
      
    } finally {
      // Cleanup
      if (fs.existsSync(inputFile)) {
        fs.unlinkSync(inputFile);
      }
    }
  }

  private enhancePortsWithLSTM(ports: PortData[], lstmPredictions?: LSTMPrediction[]): PortData[] {
    if (!lstmPredictions) {
      return ports;
    }

    return ports.map(port => {
      const portPrediction = lstmPredictions.find(p => p.port === port.name);
      if (portPrediction) {
        return {
          ...port,
          lstm_forecast: portPrediction.predictions
        };
      }
      return port;
    });
  }

  /**
   * Get service status and diagnostics
   */
  getServiceStatus(): {
    initialized: boolean;
    error: string | null;
    pythonPath: string;
    scriptPath: string;
    capabilities: string[];
  } {
    return {
      initialized: this.isInitialized,
      error: this.initializationError,
      pythonPath: this.pythonPath,
      scriptPath: this.scriptPath,
      capabilities: [
        'Container Redistribution Optimization',
        'Vehicle Routing Problem',
        'Container-Demand Assignment',
        'LSTM-Enhanced Predictions',
        'Multi-Objective Optimization',
        'Capacity Constraints',
        'Cost Minimization'
      ]
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.isInitialized = false;
    this.initializationError = null;
    console.log('🧹 OR-Tools service disposed');
  }
}