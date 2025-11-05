import * as tf from '@tensorflow/tfjs';
import { ProcessedTimeSeriesData } from './lstmPreprocessor';
import * as fs from 'fs';
import * as path from 'path';

export interface LSTMModelConfig {
  sequenceLength: number;
  featureCount: number;
  lstmUnits: number;
  dropout: number;
  learningRate: number;
  epochs: number;
  batchSize: number;
  validationSplit: number;
}

export interface TrainingProgress {
  epoch: number;
  loss: number;
  valLoss?: number;
  accuracy?: number;
  valAccuracy?: number;
}

export interface PredictionResult {
  predictions: number[];
  confidence: number[];
  timestamps: Date[];
  denormalizedPredictions: number[];
}

export class LSTMEmptyContainerModel {
  private model: tf.LayersModel | null = null;
  private config: LSTMModelConfig;
  private scalingParams: ProcessedTimeSeriesData['scalingParams'] | null = null;

  constructor(config: Partial<LSTMModelConfig> = {}) {
    this.config = {
      sequenceLength: 30,
      featureCount: 7,
      lstmUnits: 50,
      dropout: 0.2,
      learningRate: 0.001,
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      ...config
    };
  }

  /**
   * Build the LSTM model architecture
   */
  buildModel(): tf.LayersModel {
    const model = tf.sequential();

    // Input layer
    model.add(tf.layers.inputLayer({
      inputShape: [this.config.sequenceLength, this.config.featureCount]
    }));

    // First LSTM layer with dropout
    model.add(tf.layers.lstm({
      units: this.config.lstmUnits,
      returnSequences: true,
      dropout: this.config.dropout,
      recurrentDropout: this.config.dropout
    }));

    // Second LSTM layer
    model.add(tf.layers.lstm({
      units: Math.floor(this.config.lstmUnits / 2),
      returnSequences: false,
      dropout: this.config.dropout,
      recurrentDropout: this.config.dropout
    }));

    // Dense layers for final prediction
    model.add(tf.layers.dense({
      units: 25,
      activation: 'relu'
    }));

    model.add(tf.layers.dropout({ rate: this.config.dropout }));

    // Output layer
    model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid' // Output between 0 and 1 (normalized)
    }));

    // Compile model
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
      metrics: ['mae'] // Use 'mae' instead of 'meanAbsoluteError'
    });

    this.model = model;
    return model;
  }

  /**
   * Train the LSTM model
   */
  async trainModel(
    processedData: ProcessedTimeSeriesData,
    onProgress?: (progress: TrainingProgress) => void
  ): Promise<tf.History> {
    if (!this.model) {
      this.buildModel();
    }

    if (!this.model) {
      throw new Error('Failed to build model');
    }

    // Store scaling parameters for later denormalization
    this.scalingParams = processedData.scalingParams;

    console.log('Training LSTM model...');
    console.log(`Training samples: ${processedData.features.length}`);
    console.log(`Sequence length: ${this.config.sequenceLength}`);
    console.log(`Feature count: ${this.config.featureCount}`);

    // Use tf.tidy to automatically clean up tensors
    return await tf.tidy(() => {
      // Convert data to tensors
      const xTrain = tf.tensor3d(processedData.features as unknown as number[][][]);
      const yTrain = tf.tensor2d(processedData.targets, [processedData.targets.length, 1]);

      return this.model!.fit(xTrain, yTrain, {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        validationSplit: this.config.validationSplit,
        shuffle: true,
        verbose: 0,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            if (onProgress) {
              onProgress({
                epoch: epoch + 1,
                loss: logs?.loss || 0,
                valLoss: logs?.val_loss,
                accuracy: logs?.accuracy,
                valAccuracy: logs?.val_accuracy
              });
            }

            // Log progress every 10 epochs
            if ((epoch + 1) % 10 === 0) {
              console.log(`Epoch ${epoch + 1}/${this.config.epochs} - Loss: ${logs?.loss?.toFixed(4)} - Val Loss: ${logs?.val_loss?.toFixed(4)}`);
            }
          },
          onTrainEnd: async () => {
            console.log('✅ LSTM training completed');
          }
        }
      });
    });
  }

  /**
   * Make predictions using the trained model
   */
  async predict(
    inputSequences: number[][][],
    futureDays: number = 7
  ): Promise<PredictionResult> {
    if (!this.model) {
      throw new Error('Model not trained yet');
    }

    if (!this.scalingParams) {
      throw new Error('Scaling parameters not available');
    }

    const predictions: number[] = [];
    const confidence: number[] = [];

    // Use tf.tidy for automatic memory management during predictions
    for (let i = 0; i < futureDays; i++) {
      const { prediction: lastPrediction, confidenceScore } = await tf.tidy(() => {
        // Create or update input tensor
        const inputTensor = i === 0
          ? tf.tensor3d(inputSequences)
          : tf.tensor3d(inputSequences); // Will be updated below

        const prediction = this.model!.predict(inputTensor) as tf.Tensor;
        return prediction;
      }).then(async (predictionTensor) => {
        const predictionArray = await predictionTensor.data();
        const lastPred = predictionArray[predictionArray.length - 1];
        const conf = this.calculateConfidence(new Float32Array(predictionArray as ArrayLike<number>));

        // Dispose of prediction tensor after extracting data
        predictionTensor.dispose();

        return { prediction: lastPred, confidenceScore: conf };
      });

      predictions.push(lastPrediction);
      confidence.push(confidenceScore);

      // Update input sequence for next prediction (rolling window)
      if (i < futureDays - 1) {
        inputSequences = inputSequences.map(seq => {
          const newSeq = seq.slice(1); // Remove first timestep
          // Add prediction as new timestep (with all features)
          const newTimestep = [lastPrediction, 0, 0, 0, 0, 0, 0]; // Only empty container count is predicted
          newSeq.push(newTimestep);
          return newSeq;
        });
      }
    }

    // Denormalize predictions
    const denormalizedPredictions = this.denormalizePredictions(predictions);

    // Generate future timestamps
    const timestamps = this.generateFutureTimestamps(futureDays);

    return {
      predictions,
      confidence,
      timestamps,
      denormalizedPredictions
    };
  }

  /**
   * Evaluate model performance
   */
  async evaluateModel(
    testFeatures: number[][][],
    testTargets: number[]
  ): Promise<{ loss: number; mae: number; mape: number }> {
    if (!this.model) {
      throw new Error('Model not trained yet');
    }

    // Use tf.tidy for automatic cleanup
    return await tf.tidy(async () => {
      const xTest = tf.tensor3d(testFeatures);
      const yTest = tf.tensor2d(testTargets, [testTargets.length, 1]);

      const evaluation = this.model!.evaluate(xTest, yTest) as tf.Scalar[];
      const loss = await evaluation[0].data();
      const mae = await evaluation[1].data();

      // Calculate MAPE (Mean Absolute Percentage Error)
      const predictions = this.model!.predict(xTest) as tf.Tensor2D;
      const predData = await predictions.data();
      const testData = await yTest.data();

      let mapeSum = 0;
      for (let i = 0; i < testData.length; i++) {
        if (testData[i] !== 0) {
          mapeSum += Math.abs((testData[i] - predData[i]) / testData[i]);
        }
      }
      const mape = (mapeSum / testData.length) * 100;

      return {
        loss: loss[0],
        mae: mae[0],
        mape
      };
    });
  }

  /**
   * Save model to file system
   */
  async saveModel(modelName: string = 'lstm-empty-container-model'): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    try {
      const modelPath = path.join(process.cwd(), 'models', 'lstm_empty_containers');

      // Ensure directory exists
      if (!fs.existsSync(modelPath)) {
        fs.mkdirSync(modelPath, { recursive: true });
      }

      // Save model using file:// protocol
      const savePath = `file://${modelPath}`;
      await this.model.save(savePath);

      // Save scaling parameters to JSON file
      if (this.scalingParams) {
        const scalingPath = path.join(modelPath, 'scaling_params.json');
        fs.writeFileSync(scalingPath, JSON.stringify(this.scalingParams, null, 2));
      }

      console.log(`✅ Model saved to ${modelPath}`);
    } catch (error) {
      console.error('❌ Error saving model:', error);
      throw error;
    }
  }

  /**
   * Load model from file system
   */
  async loadModel(modelName: string = 'lstm-empty-container-model'): Promise<void> {
    try {
      const modelPath = path.join(process.cwd(), 'models', 'lstm_empty_containers');
      const modelJsonPath = path.join(modelPath, 'model.json');

      // Check if model file exists
      if (!fs.existsSync(modelJsonPath)) {
        throw new Error(`Model not found at ${modelJsonPath}`);
      }

      // Load model using file:// protocol
      const loadPath = `file://${modelJsonPath}`;
      this.model = await tf.loadLayersModel(loadPath);

      // Load scaling parameters from JSON file
      const scalingPath = path.join(modelPath, 'scaling_params.json');
      if (fs.existsSync(scalingPath)) {
        const scalingData = fs.readFileSync(scalingPath, 'utf-8');
        this.scalingParams = JSON.parse(scalingData);
      }

      console.log(`✅ Model loaded from ${modelPath}`);
    } catch (error) {
      console.error('❌ Error loading model:', error);
      throw error;
    }
  }

  /**
   * Get model summary
   */
  getModelSummary(): string {
    if (!this.model) {
      return 'Model not built yet';
    }

    let summary = '';
    this.model.summary(undefined, undefined, (line) => {
      summary += line + '\n';
    });

    return summary;
  }

  /**
   * Get model configuration
   */
  getConfig(): LSTMModelConfig {
    return { ...this.config };
  }

  private calculateConfidence(predictions: Float32Array): number {
    // Simple confidence calculation based on prediction consistency
    // In a more sophisticated implementation, you might use ensemble methods
    // or uncertainty quantification techniques
    const mean = predictions.reduce((sum, val) => sum + val, 0) / predictions.length;
    const variance = predictions.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / predictions.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Convert standard deviation to confidence (lower std = higher confidence)
    return Math.max(0, Math.min(1, 1 - (standardDeviation * 2)));
  }

  private denormalizePredictions(normalizedPredictions: number[]): number[] {
    if (!this.scalingParams) {
      throw new Error('Scaling parameters not available');
    }

    const { targetMin, targetMax } = this.scalingParams;
    
    return normalizedPredictions.map(pred => 
      Math.round(pred * (targetMax - targetMin) + targetMin)
    );
  }

  private generateFutureTimestamps(futureDays: number): Date[] {
    const timestamps: Date[] = [];
    const now = new Date();
    
    for (let i = 1; i <= futureDays; i++) {
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + i);
      timestamps.push(futureDate);
    }
    
    return timestamps;
  }

  /**
   * Dispose of the model to free memory
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      console.log('✅ LSTM model disposed');
    }
  }
}