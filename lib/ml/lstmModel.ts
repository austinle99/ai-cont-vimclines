import * as tf from '@tensorflow/tfjs';
import { ProcessedTimeSeriesData } from './lstmPreprocessor';

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

    // Convert data to tensors
    const xTrain = tf.tensor3d(processedData.features as unknown as number[][][]);
    const yTrain = tf.tensor2d(processedData.targets, [processedData.targets.length, 1]);

    console.log('Training LSTM model...');
    console.log(`Training samples: ${processedData.features.length}`);
    console.log(`Sequence length: ${this.config.sequenceLength}`);
    console.log(`Feature count: ${this.config.featureCount}`);

    try {
      const history = await this.model.fit(xTrain, yTrain, {
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
          }
        }
      });

      console.log('✅ LSTM training completed');
      
      // Clean up tensors
      xTrain.dispose();
      yTrain.dispose();

      return history;
    } catch (error) {
      // Clean up tensors on error
      xTrain.dispose();
      yTrain.dispose();
      throw error;
    }
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

    // Create tensor from input
    const inputTensor = tf.tensor3d(inputSequences);

    try {
      // Make initial prediction
      let currentInput = inputTensor;
      
      for (let i = 0; i < futureDays; i++) {
        const prediction = this.model.predict(currentInput) as tf.Tensor;
        const predictionArray = await prediction.data();
        
        // Get the last prediction
        const lastPrediction = predictionArray[predictionArray.length - 1];
        predictions.push(lastPrediction);
        
        // Calculate confidence based on model's consistency
        // (This is a simplified confidence metric)
        const confidenceScore = this.calculateConfidence(new Float32Array(predictionArray as ArrayLike<number>));
        confidence.push(confidenceScore);

        // Update input for next prediction (rolling window)
        if (i < futureDays - 1) {
          // Create new sequence by shifting and adding prediction
          const currentData = await currentInput.array() as number[][][];
          const newSequence = currentData.map(seq => {
            const newSeq = seq.slice(1); // Remove first timestep
            // Add prediction as new timestep (with all features)
            const newTimestep = [lastPrediction, 0, 0, 0, 0, 0, 0]; // Only empty container count is predicted
            newSeq.push(newTimestep);
            return newSeq;
          });
          
          currentInput.dispose();
          currentInput = tf.tensor3d(newSequence);
        }

        prediction.dispose();
      }

      currentInput.dispose();

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

    } catch (error) {
      inputTensor.dispose();
      throw error;
    }
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

    const xTest = tf.tensor3d(testFeatures);
    const yTest = tf.tensor2d(testTargets, [testTargets.length, 1]);

    try {
      const evaluation = this.model.evaluate(xTest, yTest) as tf.Scalar[];
      const loss = await evaluation[0].data();
      const mae = await evaluation[1].data();

      // Calculate MAPE (Mean Absolute Percentage Error)
      const predictions = this.model.predict(xTest) as tf.Tensor2D;
      const predData = await predictions.data();
      const testData = await yTest.data();
      
      let mapeSum = 0;
      for (let i = 0; i < testData.length; i++) {
        if (testData[i] !== 0) {
          mapeSum += Math.abs((testData[i] - predData[i]) / testData[i]);
        }
      }
      const mape = (mapeSum / testData.length) * 100;

      // Clean up
      xTest.dispose();
      yTest.dispose();
      predictions.dispose();
      evaluation.forEach(tensor => tensor.dispose());

      return {
        loss: loss[0],
        mae: mae[0],
        mape
      };

    } catch (error) {
      xTest.dispose();
      yTest.dispose();
      throw error;
    }
  }

  /**
   * Save model to local storage or indexedDB
   */
  async saveModel(modelName: string = 'lstm-empty-container-model'): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    try {
      await this.model.save(`indexeddb://${modelName}`);
      
      // Save scaling parameters separately
      if (this.scalingParams) {
        localStorage.setItem(`${modelName}-scaling`, JSON.stringify(this.scalingParams));
      }
      
      console.log(`✅ Model saved as ${modelName}`);
    } catch (error) {
      console.error('❌ Error saving model:', error);
      throw error;
    }
  }

  /**
   * Load model from local storage or indexedDB
   */
  async loadModel(modelName: string = 'lstm-empty-container-model'): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`indexeddb://${modelName}`);
      
      // Load scaling parameters
      const scalingData = localStorage.getItem(`${modelName}-scaling`);
      if (scalingData) {
        this.scalingParams = JSON.parse(scalingData);
      }
      
      console.log(`✅ Model loaded: ${modelName}`);
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