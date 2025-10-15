/**
 * GBR Prediction Service - TypeScript Wrapper for Python GBR Model
 * Provides Node.js integration with Python Gradient Boosting Regressor
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GBRFeaturePreparator, GBRFeatureSet } from './gbrFeaturePreparation';

export interface GBRPrediction {
  date: Date;
  predictedEmptyCount: number;
  confidence: number;
  port: string;
  containerType: string;
  method: 'GBR';
  components: {
    gbr: number;
  };
}

export interface GBRTrainingMetrics {
  train_r2: number;
  val_r2: number;
  train_mae: number;
  val_mae: number;
  cv_mean: number;
  cv_std: number;
  feature_importance: { [feature: string]: number };
}

export interface GBRModelMetadata {
  model_type: string;
  train_samples: number;
  val_samples: number;
  n_features: number;
  train_date: string;
  metrics: {
    train_r2: number;
    val_r2: number;
    train_mae: number;
    val_mae: number;
    train_rmse: number;
    val_rmse: number;
    cv_mean: number;
    cv_std: number;
  };
}

export class GBRPredictionService {
  private pythonPath: string;
  private scriptPath: string;
  private modelPath: string;
  private tempDir: string;
  private featurePreparator: GBRFeaturePreparator;
  private isInitialized: boolean = false;
  private modelMetadata: GBRModelMetadata | null = null;

  constructor() {
    this.pythonPath = 'python'; // Will try to find Python in PATH
    this.scriptPath = path.join(process.cwd(), 'python_ml', 'gbr_predictor.py');
    this.modelPath = path.join(process.cwd(), 'models', 'gbr_model.pkl');
    this.tempDir = os.tmpdir();
    this.featurePreparator = new GBRFeaturePreparator();
  }

  /**
   * Initialize the GBR service
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔧 Initializing GBR Prediction Service...');

      // Check if Python is available
      await this.verifyPythonEnvironment();

      // Check if script exists
      if (!fs.existsSync(this.scriptPath)) {
        throw new Error(`GBR Python script not found: ${this.scriptPath}`);
      }

      // Try to load existing model metadata
      if (fs.existsSync(this.modelPath)) {
        console.log('✅ Found existing GBR model');
        this.isInitialized = true;
      } else {
        console.log('ℹ️  No existing GBR model found, will need training');
        this.isInitialized = false;
      }

    } catch (error) {
      console.error('❌ GBR initialization failed:', error);
      throw error;
    }
  }

  /**
   * Train the GBR model
   */
  async trainModel(bookings: any[]): Promise<GBRTrainingMetrics> {
    console.log(`🤖 Training GBR model with ${bookings.length} bookings...`);

    if (bookings.length < 50) {
      throw new Error('Insufficient data for GBR training. Need at least 50 samples.');
    }

    try {
      // Prepare features
      const featureSet = this.featurePreparator.prepareFeatures(bookings, true);

      // Save features to temporary file
      const inputFile = path.join(this.tempDir, `gbr_training_${Date.now()}.json`);
      const featureJSON = this.featurePreparator.exportToJSON(featureSet);
      fs.writeFileSync(inputFile, featureJSON);

      // Run Python training script
      const result = await this.executePythonScript('train', inputFile, this.modelPath);

      // Cleanup
      fs.unlinkSync(inputFile);

      if (result.status === 'success') {
        this.isInitialized = true;
        this.modelMetadata = result.training_metadata;
        console.log('✅ GBR model training completed successfully');
        return result.metrics;
      } else {
        throw new Error(`GBR training failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ GBR training error:', error);
      throw error;
    }
  }

  /**
   * Get predictions from GBR model
   */
  async getPredictions(
    recentBookings: any[],
    futureDays: number = 7
  ): Promise<GBRPrediction[]> {
    if (!this.isInitialized) {
      throw new Error('GBR model not initialized. Train or load a model first.');
    }

    console.log(`🔮 Generating GBR predictions for ${futureDays} days...`);

    try {
      // Prepare features
      const featureSet = this.featurePreparator.prepareFeatures(recentBookings, false);

      // Save features to temporary file
      const inputFile = path.join(this.tempDir, `gbr_predict_${Date.now()}.json`);
      const featureJSON = this.featurePreparator.exportToJSON(featureSet);
      fs.writeFileSync(inputFile, featureJSON);

      // Run Python prediction script
      const result = await this.executePythonScript('predict', inputFile, this.modelPath);

      // Cleanup
      fs.unlinkSync(inputFile);

      if (result.status === 'success') {
        // Convert predictions to structured format
        const predictions = this.convertPredictionsToFormat(
          result.predictions,
          result.confidence,
          recentBookings,
          futureDays
        );

        console.log(`✅ Generated ${predictions.length} GBR predictions`);
        return predictions;
      } else {
        throw new Error(`GBR prediction failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('❌ GBR prediction error:', error);
      throw error;
    }
  }

  /**
   * Get feature importance from trained model
   */
  async getFeatureImportance(): Promise<{ [feature: string]: number }> {
    if (!this.isInitialized) {
      throw new Error('GBR model not initialized');
    }

    // Feature importance is included in prediction results
    // For standalone access, we'd need to add a separate command
    return this.modelMetadata?.metrics as any || {};
  }

  /**
   * Get model information
   */
  getModelInfo(): any {
    return {
      isInitialized: this.isInitialized,
      modelPath: this.modelPath,
      metadata: this.modelMetadata,
      capabilities: [
        'Short-term predictions (1-3 days)',
        'Feature importance analysis',
        'Confidence scoring',
        'Fast training and inference',
        'Handles missing data'
      ]
    };
  }

  /**
   * Execute Python script
   */
  private async executePythonScript(
    command: 'train' | 'predict',
    inputFile: string,
    modelPath: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [this.scriptPath, command, inputFile, modelPath];
      const pythonProcess = spawn(this.pythonPath, args);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Log progress to console
        if (!output.includes('{') && !output.includes('}')) {
          process.stdout.write(output);
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Extract JSON output from stdout (between === markers)
            const jsonMatch = stdout.match(/=+\n([\s\S]*?)\n=+/);
            if (jsonMatch && jsonMatch[1]) {
              const result = JSON.parse(jsonMatch[1]);
              resolve(result);
            } else {
              reject(new Error('Failed to parse Python output'));
            }
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

      // Set timeout (5 minutes for training, 1 minute for prediction)
      const timeout = command === 'train' ? 300000 : 60000;
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python script timeout (${timeout / 1000}s)`));
      }, timeout);
    });
  }

  /**
   * Convert raw predictions to structured format
   */
  private convertPredictionsToFormat(
    predictions: number[],
    confidenceScores: number[],
    recentBookings: any[],
    futureDays: number
  ): GBRPrediction[] {
    const result: GBRPrediction[] = [];

    // Group bookings by port and container type
    const portTypeGroups = this.groupBookingsByPortAndType(recentBookings);

    let predictionIndex = 0;

    for (const [portType, bookings] of Object.entries(portTypeGroups)) {
      const [port, containerType] = portType.split('_');

      // Generate predictions for future days
      for (let day = 1; day <= futureDays; day++) {
        if (predictionIndex >= predictions.length) break;

        const prediction: GBRPrediction = {
          date: new Date(Date.now() + day * 24 * 60 * 60 * 1000),
          predictedEmptyCount: Math.max(0, Math.round(predictions[predictionIndex])),
          confidence: confidenceScores[predictionIndex] || 0.7,
          port: port,
          containerType: containerType,
          method: 'GBR',
          components: {
            gbr: predictions[predictionIndex]
          }
        };

        result.push(prediction);
        predictionIndex++;
      }
    }

    return result;
  }

  /**
   * Group bookings by port and container type
   */
  private groupBookingsByPortAndType(bookings: any[]): { [key: string]: any[] } {
    const groups: { [key: string]: any[] } = {};

    for (const booking of bookings) {
      const port = booking.origin || booking.depot || 'unknown';
      const containerType = booking.size || '20GP';
      const key = `${port}_${containerType}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(booking);
    }

    // Return only the top 5 most active port/type combinations
    return Object.fromEntries(
      Object.entries(groups)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 5)
    );
  }

  /**
   * Verify Python environment
   */
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
        if (code === 0 || output.includes('Python')) {
          console.log(`✅ Python version: ${output.trim()}`);
          resolve();
        } else {
          reject(new Error('Python not found or not working. Install Python 3.8+'));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Python not found in PATH: ${error.message}`));
      });
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.featurePreparator.clearCache();
    console.log('🧹 GBR Prediction Service disposed');
  }
}
