import { LSTMDataPreprocessor, TimeSeriesData, ProcessedTimeSeriesData } from './lstmPreprocessor';
import { LSTMEmptyContainerModel, LSTMModelConfig, TrainingProgress, PredictionResult } from './lstmModel';

export interface TrainingConfig {
  modelConfig: Partial<LSTMModelConfig>;
  dataConfig: {
    sequenceLength: number;
    predictionHorizon: number;
    trainTestSplit: number;
  };
  retraining: {
    enabled: boolean;
    minNewSamples: number;
    maxAge: number; // days
  };
}

export interface TrainingMetrics {
  trainingLoss: number;
  validationLoss: number;
  testLoss: number;
  testMAE: number;
  testMAPE: number;
  sampleCount: number;
  trainingTime: number; // milliseconds
}

export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rmse: number;
}

export class LSTMTrainingPipeline {
  private preprocessor: LSTMDataPreprocessor;
  private model: LSTMEmptyContainerModel;
  private config: TrainingConfig;
  private lastTrainingDate: Date | null = null;

  constructor(config: Partial<TrainingConfig> = {}) {
    this.config = {
      modelConfig: {
        lstmUnits: 50,
        dropout: 0.2,
        learningRate: 0.001,
        epochs: 100,
        batchSize: 32,
        validationSplit: 0.2
      },
      dataConfig: {
        sequenceLength: 30,
        predictionHorizon: 7,
        trainTestSplit: 0.8
      },
      retraining: {
        enabled: true,
        minNewSamples: 100,
        maxAge: 30 // retrain every 30 days
      },
      ...config
    };

    this.preprocessor = new LSTMDataPreprocessor(
      this.config.dataConfig.sequenceLength,
      this.config.dataConfig.predictionHorizon
    );

    this.model = new LSTMEmptyContainerModel(this.config.modelConfig);
  }

  /**
   * Full training pipeline from raw booking data
   */
  async trainFromBookings(
    bookings: any[],
    onProgress?: (progress: TrainingProgress) => void
  ): Promise<TrainingMetrics> {
    console.log('🚀 Starting LSTM training pipeline...');
    const startTime = Date.now();

    try {
      // Step 1: Prepare time series data
      console.log('📊 Step 1: Preparing time series data...');
      const timeSeriesData = await this.preprocessor.prepareTimeSeriesFromBookings(bookings);
      
      if (timeSeriesData.length === 0) {
        throw new Error('No time series data could be extracted from bookings');
      }

      console.log(`   ✅ Extracted ${timeSeriesData.length} time series data points`);

      // Step 2: Fill missing dates
      console.log('📈 Step 2: Filling missing dates...');
      const filledData = this.preprocessor.fillMissingDates(timeSeriesData);
      console.log(`   ✅ Data filled: ${filledData.length} total points`);

      // Step 3: Create sequences
      console.log('🔄 Step 3: Creating sequences for LSTM...');
      const processedData = this.preprocessor.createSequences(filledData);
      console.log(`   ✅ Created ${processedData.features.length} sequences`);

      // Step 4: Train-test split
      const { trainData, testData } = this.createTrainTestSplit(processedData);
      console.log(`   ✅ Train: ${trainData.features.length}, Test: ${testData.features.length} samples`);

      // Step 5: Train the model
      console.log('🤖 Step 4: Training LSTM model...');
      const history = await this.model.trainModel(trainData, onProgress);

      // Step 6: Evaluate on test set
      console.log('📊 Step 5: Evaluating model performance...');
      const evaluation = await this.model.evaluateModel(
        testData.features,
        testData.targets
      );

      const trainingTime = Date.now() - startTime;
      this.lastTrainingDate = new Date();

      const metrics: TrainingMetrics = {
        trainingLoss: history.history.loss[history.history.loss.length - 1] as number,
        validationLoss: history.history.val_loss ? 
          history.history.val_loss[history.history.val_loss.length - 1] as number : 0,
        testLoss: evaluation.loss,
        testMAE: evaluation.mae,
        testMAPE: evaluation.mape,
        sampleCount: processedData.features.length,
        trainingTime
      };

      console.log('✅ LSTM training pipeline completed!');
      console.log(`   📈 Training Loss: ${metrics.trainingLoss.toFixed(4)}`);
      console.log(`   📉 Validation Loss: ${metrics.validationLoss.toFixed(4)}`);
      console.log(`   🎯 Test MAPE: ${metrics.testMAPE.toFixed(2)}%`);
      console.log(`   ⏱️  Training Time: ${(trainingTime / 1000).toFixed(2)}s`);

      return metrics;

    } catch (error) {
      console.error('❌ LSTM training pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Predict future empty containers
   */
  async predictEmptyContainers(
    recentBookings: any[],
    futureDays: number = 7
  ): Promise<PredictionResult> {
    try {
      // Prepare recent data as input sequence
      const timeSeriesData = await this.preprocessor.prepareTimeSeriesFromBookings(recentBookings);
      const filledData = this.preprocessor.fillMissingDates(timeSeriesData);
      
      // Get the most recent sequence
      const sequenceLength = this.config.dataConfig.sequenceLength;
      if (filledData.length < sequenceLength) {
        throw new Error(`Insufficient recent data: need ${sequenceLength} points, got ${filledData.length}`);
      }

      // Take the most recent sequence
      const recentSequence = filledData.slice(-sequenceLength);
      
      // Normalize the sequence
      const rawFeatures = recentSequence.map(d => [
        d.emptyContainerCount,
        d.totalBookings,
        d.utilizationRate,
        d.seasonalFactor,
        this.getDayOfWeek(d.timestamp),
        this.getDayOfMonth(d.timestamp),
        this.getMonth(d.timestamp)
      ]);

      // Note: For production use, you should store and reuse the scaling parameters
      // from training. For simplicity, we're calculating them here.
      const normalizedFeatures = this.normalizeFeatures(rawFeatures);

      // Make predictions
      const predictions = await this.model.predict([normalizedFeatures], futureDays);

      return predictions;

    } catch (error) {
      console.error('❌ Error predicting empty containers:', error);
      throw error;
    }
  }

  /**
   * Check if model needs retraining
   */
  shouldRetrain(newSampleCount: number): boolean {
    if (!this.config.retraining.enabled) {
      return false;
    }

    // Check if enough new samples
    if (newSampleCount < this.config.retraining.minNewSamples) {
      return false;
    }

    // Check if model is too old
    if (this.lastTrainingDate) {
      const daysSinceTraining = (Date.now() - this.lastTrainingDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceTraining > this.config.retraining.maxAge) {
        return true;
      }
    } else {
      // No previous training
      return true;
    }

    return false;
  }

  /**
   * Incremental training with new data
   */
  async incrementalTrain(
    newBookings: any[],
    onProgress?: (progress: TrainingProgress) => void
  ): Promise<TrainingMetrics> {
    console.log('🔄 Starting incremental training...');
    
    // For true incremental learning, you would typically:
    // 1. Load existing model
    // 2. Fine-tune with new data using lower learning rate
    // 3. Use techniques like Experience Replay
    
    // For simplicity, we'll retrain the entire model
    return this.trainFromBookings(newBookings, onProgress);
  }

  /**
   * Get model performance metrics
   */
  async evaluatePerformance(
    testBookings: any[]
  ): Promise<ModelPerformance> {
    try {
      const timeSeriesData = await this.preprocessor.prepareTimeSeriesFromBookings(testBookings);
      const filledData = this.preprocessor.fillMissingDates(timeSeriesData);
      const processedData = this.preprocessor.createSequences(filledData);

      const evaluation = await this.model.evaluateModel(
        processedData.features,
        processedData.targets
      );

      // Calculate additional metrics
      const predictions = await this.model.predict(processedData.features);
      const performance = this.calculatePerformanceMetrics(
        processedData.targets,
        predictions.predictions
      );

      return performance;

    } catch (error) {
      console.error('❌ Error evaluating performance:', error);
      throw error;
    }
  }

  /**
   * Save the trained model
   */
  async saveModel(modelName?: string): Promise<void> {
    await this.model.saveModel(modelName);
    
    // Save training metadata
    const metadata = {
      lastTrainingDate: this.lastTrainingDate,
      config: this.config
    };
    
    localStorage.setItem(`${modelName || 'lstm-empty-container-model'}-metadata`, 
      JSON.stringify(metadata));
  }

  /**
   * Load a previously trained model
   */
  async loadModel(modelName?: string): Promise<void> {
    await this.model.loadModel(modelName);
    
    // Load training metadata
    const metadataStr = localStorage.getItem(`${modelName || 'lstm-empty-container-model'}-metadata`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      this.lastTrainingDate = metadata.lastTrainingDate ? new Date(metadata.lastTrainingDate) : null;
      this.config = { ...this.config, ...metadata.config };
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): {
    summary: string;
    config: TrainingConfig;
    lastTraining: Date | null;
  } {
    return {
      summary: this.model.getModelSummary(),
      config: this.config,
      lastTraining: this.lastTrainingDate
    };
  }

  private createTrainTestSplit(data: ProcessedTimeSeriesData): {
    trainData: ProcessedTimeSeriesData;
    testData: ProcessedTimeSeriesData;
  } {
    const splitIndex = Math.floor(data.features.length * this.config.dataConfig.trainTestSplit);

    const trainData: ProcessedTimeSeriesData = {
      features: data.features.slice(0, splitIndex),
      targets: data.targets.slice(0, splitIndex),
      timestamps: data.timestamps.slice(0, splitIndex),
      scalingParams: data.scalingParams,
      metadata: data.metadata
    };

    const testData: ProcessedTimeSeriesData = {
      features: data.features.slice(splitIndex),
      targets: data.targets.slice(splitIndex),
      timestamps: data.timestamps.slice(splitIndex),
      scalingParams: data.scalingParams,
      metadata: data.metadata
    };

    return { trainData, testData };
  }

  private normalizeFeatures(features: number[][]): number[][] {
    // Calculate min/max for normalization
    const featureCount = features[0].length;
    const mins = Array(featureCount).fill(Infinity);
    const maxs = Array(featureCount).fill(-Infinity);

    features.forEach(row => {
      row.forEach((value, i) => {
        mins[i] = Math.min(mins[i], value);
        maxs[i] = Math.max(maxs[i], value);
      });
    });

    // Normalize
    return features.map(row =>
      row.map((value, i) =>
        maxs[i] > mins[i] ? (value - mins[i]) / (maxs[i] - mins[i]) : 0
      )
    );
  }

  private calculatePerformanceMetrics(actual: number[], predicted: number[]): ModelPerformance {
    let accuracy = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let sumSquaredError = 0;

    const threshold = 0.5; // for binary classification metrics

    for (let i = 0; i < actual.length; i++) {
      const actualBinary = actual[i] > threshold ? 1 : 0;
      const predictedBinary = predicted[i] > threshold ? 1 : 0;

      if (actualBinary === predictedBinary) accuracy++;
      
      if (predictedBinary === 1 && actualBinary === 1) truePositives++;
      if (predictedBinary === 1 && actualBinary === 0) falsePositives++;
      if (predictedBinary === 0 && actualBinary === 1) falseNegatives++;

      sumSquaredError += Math.pow(actual[i] - predicted[i], 2);
    }

    accuracy = accuracy / actual.length;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    const rmse = Math.sqrt(sumSquaredError / actual.length);

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      rmse
    };
  }

  private getDayOfWeek(date: Date): number {
    return date.getDay() / 6;
  }

  private getDayOfMonth(date: Date): number {
    return (date.getDate() - 1) / 30;
  }

  private getMonth(date: Date): number {
    return date.getMonth() / 11;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.model.dispose();
  }
}