/**
 * Ensemble Prediction Service
 * Combines GBR (short-term) and LSTM (long-term) predictions
 * Uses weighted averaging based on prediction horizon and confidence
 */

import { LSTMPredictionService, EmptyContainerPrediction } from './lstmPredictionService';
import { GBRPredictionService, GBRPrediction } from './gbrPredictionService';

export interface EnsemblePrediction extends EmptyContainerPrediction {
  method: string; // 'Ensemble (GBR + LSTM)', 'GBR-Only', 'LSTM-Only'
  components: {
    gbr?: number;
    lstm?: number;
    ensemble?: number;
  };
  weights: {
    gbr: number;
    lstm: number;
  };
}

export interface EnsembleConfig {
  // Weights for different prediction horizons
  shortTermDays: number; // Days 1-3 use short-term weights
  shortTermGBRWeight: number; // GBR weight for days 1-3 (e.g., 0.7)
  longTermGBRWeight: number; // GBR weight for days 4+ (e.g., 0.3)

  // Confidence boosting
  confidenceBoostThreshold: number; // If confidence > threshold, boost weight
  confidenceBoostAmount: number; // Amount to boost weight by

  // Fallback behavior
  enableFallback: boolean; // Use single model if other fails
  minimumConfidence: number; // Minimum acceptable confidence
}

export class EnsemblePredictionService {
  private lstmService: LSTMPredictionService;
  private gbrService: GBRPredictionService;
  private config: EnsembleConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<EnsembleConfig>) {
    this.lstmService = new LSTMPredictionService();
    this.gbrService = new GBRPredictionService();

    // Default ensemble configuration
    this.config = {
      shortTermDays: 3,
      shortTermGBRWeight: 0.7, // GBR is better for short-term
      longTermGBRWeight: 0.3, // LSTM is better for long-term
      confidenceBoostThreshold: 0.9,
      confidenceBoostAmount: 0.1,
      enableFallback: true,
      minimumConfidence: 0.3,
      ...config
    };
  }

  /**
   * Initialize both LSTM and GBR services
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Ensemble Prediction Service...');

      // Initialize both services in parallel
      await Promise.allSettled([
        this.lstmService.initialize(),
        this.gbrService.initialize()
      ]);

      // Check which services are available
      const lstmStatus = this.isLSTMAvailable();
      const gbrStatus = this.isGBRAvailable();

      if (!lstmStatus && !gbrStatus) {
        throw new Error('Both LSTM and GBR services failed to initialize');
      }

      if (!lstmStatus) {
        console.warn('⚠️  LSTM service not available, will use GBR-only predictions');
      }

      if (!gbrStatus) {
        console.warn('⚠️  GBR service not available, will use LSTM-only predictions');
      }

      this.isInitialized = true;
      console.log('✅ Ensemble Prediction Service initialized');
      console.log(`   LSTM: ${lstmStatus ? '✅' : '❌'}  GBR: ${gbrStatus ? '✅' : '❌'}`);

    } catch (error) {
      console.error('❌ Ensemble initialization failed:', error);
      throw error;
    }
  }

  /**
   * Train both models
   */
  async trainModels(bookings: any[]): Promise<{
    lstm?: any;
    gbr?: any;
  }> {
    console.log(`🤖 Training ensemble models with ${bookings.length} bookings...`);

    const results: any = {};

    // Train LSTM
    try {
      if (bookings.length >= 30) {
        console.log('📊 Training LSTM model...');
        results.lstm = await this.lstmService.trainModel(bookings);
        console.log('✅ LSTM training completed');
      } else {
        console.log('⚠️  Insufficient data for LSTM training (need 30+ samples)');
      }
    } catch (error) {
      console.error('❌ LSTM training failed:', error);
    }

    // Train GBR
    try {
      if (bookings.length >= 50) {
        console.log('📊 Training GBR model...');
        results.gbr = await this.gbrService.trainModel(bookings);
        console.log('✅ GBR training completed');
      } else {
        console.log('⚠️  Insufficient data for GBR training (need 50+ samples)');
      }
    } catch (error) {
      console.error('❌ GBR training failed:', error);
    }

    return results;
  }

  /**
   * Get ensemble predictions combining GBR and LSTM
   */
  async getPredictions(
    recentBookings: any[],
    futureDays: number = 7
  ): Promise<EnsemblePrediction[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`🔮 Generating ensemble predictions for ${futureDays} days...`);

    try {
      // Get predictions from both models in parallel
      const [lstmResult, gbrResult] = await Promise.allSettled([
        this.getLSTMPredictions(recentBookings, futureDays),
        this.getGBRPredictions(recentBookings, futureDays)
      ]);

      const lstmPredictions = lstmResult.status === 'fulfilled' ? lstmResult.value : null;
      const gbrPredictions = gbrResult.status === 'fulfilled' ? gbrResult.value : null;

      // Check if we have predictions from at least one model
      if (!lstmPredictions && !gbrPredictions) {
        throw new Error('Both LSTM and GBR predictions failed');
      }

      // Use fallback if one model failed
      if (!lstmPredictions && gbrPredictions) {
        console.log('⚠️  Using GBR-only predictions (LSTM unavailable)');
        return this.convertToEnsemble(gbrPredictions, null, 'GBR-Only');
      }

      if (lstmPredictions && !gbrPredictions) {
        console.log('⚠️  Using LSTM-only predictions (GBR unavailable)');
        return this.convertToEnsemble(null, lstmPredictions, 'LSTM-Only');
      }

      // Both models available - create ensemble
      console.log('🎯 Combining predictions from both models...');
      const ensemblePredictions = this.combinePredict(
        gbrPredictions!,
        lstmPredictions!,
        futureDays
      );

      console.log(`✅ Generated ${ensemblePredictions.length} ensemble predictions`);
      return ensemblePredictions;

    } catch (error) {
      console.error('❌ Ensemble prediction error:', error);
      throw error;
    }
  }

  /**
   * Combine GBR and LSTM predictions using weighted averaging
   */
  private combinePredict(
    gbrPredictions: GBRPrediction[],
    lstmPredictions: EmptyContainerPrediction[],
    futureDays: number
  ): EnsemblePrediction[] {
    const result: EnsemblePrediction[] = [];

    // Match predictions by port, container type, and date
    const predictionMap = this.matchPredictions(gbrPredictions, lstmPredictions);

    for (const [key, pair] of predictionMap.entries()) {
      const gbr = pair.gbr;
      const lstm = pair.lstm;

      // Determine day ahead (for weight calculation)
      const dayAhead = lstm?.date ? Math.ceil(
        (lstm.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ) : 1;

      // Calculate weights based on prediction horizon
      const weights = this.calculateWeights(dayAhead, gbr, lstm);

      // Combine predictions
      const gbrValue = gbr?.predictedEmptyCount || 0;
      const lstmValue = lstm?.predictedEmptyCount || 0;
      const ensembleValue = (gbrValue * weights.gbr) + (lstmValue * weights.lstm);

      // Combine confidence scores
      const gbrConfidence = gbr?.confidence || 0;
      const lstmConfidence = lstm?.confidence || 0;
      const ensembleConfidence = Math.max(
        (gbrConfidence * weights.gbr) + (lstmConfidence * weights.lstm),
        this.config.minimumConfidence
      );

      // Create ensemble prediction
      const prediction: EnsemblePrediction = {
        date: lstm?.date || gbr?.date || new Date(),
        predictedEmptyCount: Math.max(0, Math.round(ensembleValue)),
        confidence: ensembleConfidence,
        port: lstm?.port || gbr?.port || 'Unknown',
        containerType: lstm?.containerType || gbr?.containerType || '20GP',
        trend: lstm?.trend || 'stable',
        riskLevel: this.calculateRiskLevel(ensembleValue, ensembleConfidence),
        method: 'Ensemble (GBR + LSTM)',
        forecastMethod: `Ensemble: ${(weights.gbr * 100).toFixed(0)}% GBR, ${(weights.lstm * 100).toFixed(0)}% LSTM`,
        components: {
          gbr: gbrValue,
          lstm: lstmValue,
          ensemble: ensembleValue
        },
        weights: weights
      };

      result.push(prediction);
    }

    // Sort by date
    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Calculate weights based on prediction horizon and confidence
   */
  private calculateWeights(
    dayAhead: number,
    gbrPred: GBRPrediction | null,
    lstmPred: EmptyContainerPrediction | null
  ): { gbr: number; lstm: number } {
    // Base weights based on prediction horizon
    let gbrWeight = dayAhead <= this.config.shortTermDays
      ? this.config.shortTermGBRWeight
      : this.config.longTermGBRWeight;

    let lstmWeight = 1 - gbrWeight;

    // Confidence boosting: if one model has high confidence, increase its weight
    if (gbrPred && gbrPred.confidence >= this.config.confidenceBoostThreshold) {
      gbrWeight += this.config.confidenceBoostAmount;
    }

    if (lstmPred && lstmPred.confidence >= this.config.confidenceBoostThreshold) {
      lstmWeight += this.config.confidenceBoostAmount;
    }

    // Normalize weights to sum to 1
    const totalWeight = gbrWeight + lstmWeight;
    if (totalWeight > 0) {
      gbrWeight /= totalWeight;
      lstmWeight /= totalWeight;
    }

    // Handle case where one model is missing
    if (!gbrPred) {
      gbrWeight = 0;
      lstmWeight = 1;
    }
    if (!lstmPred) {
      gbrWeight = 1;
      lstmWeight = 0;
    }

    return { gbr: gbrWeight, lstm: lstmWeight };
  }

  /**
   * Match GBR and LSTM predictions by port, type, and date
   */
  private matchPredictions(
    gbrPredictions: GBRPrediction[],
    lstmPredictions: EmptyContainerPrediction[]
  ): Map<string, { gbr: GBRPrediction | null; lstm: EmptyContainerPrediction | null }> {
    const map = new Map<string, { gbr: GBRPrediction | null; lstm: EmptyContainerPrediction | null }>();

    // Add GBR predictions
    for (const gbr of gbrPredictions) {
      const key = this.createPredictionKey(gbr.port, gbr.containerType, gbr.date);
      map.set(key, { gbr, lstm: null });
    }

    // Match or add LSTM predictions
    for (const lstm of lstmPredictions) {
      const key = this.createPredictionKey(lstm.port, lstm.containerType, lstm.date);
      const existing = map.get(key);

      if (existing) {
        existing.lstm = lstm;
      } else {
        map.set(key, { gbr: null, lstm });
      }
    }

    return map;
  }

  /**
   * Create unique key for matching predictions
   */
  private createPredictionKey(port: string, containerType: string, date: Date): string {
    const dateKey = date.toISOString().split('T')[0];
    return `${port}_${containerType}_${dateKey}`;
  }

  /**
   * Calculate risk level
   */
  private calculateRiskLevel(prediction: number, confidence: number): 'low' | 'medium' | 'high' {
    const normalizedPrediction = Math.min(prediction / 50, 1);
    const riskScore = normalizedPrediction * confidence;

    if (riskScore > 0.7) return 'high';
    if (riskScore > 0.4) return 'medium';
    return 'low';
  }

  /**
   * Convert single-model predictions to ensemble format
   */
  private convertToEnsemble(
    gbrPredictions: GBRPrediction[] | null,
    lstmPredictions: EmptyContainerPrediction[] | null,
    method: string
  ): EnsemblePrediction[] {
    const source = gbrPredictions || lstmPredictions;
    if (!source) return [];

    return source.map(pred => ({
      ...pred,
      method: method,
      forecastMethod: method,
      weights: {
        gbr: gbrPredictions ? 1 : 0,
        lstm: lstmPredictions ? 1 : 0
      },
      components: {
        gbr: gbrPredictions ? pred.predictedEmptyCount : undefined,
        lstm: lstmPredictions ? pred.predictedEmptyCount : undefined,
        ensemble: pred.predictedEmptyCount
      }
    }));
  }

  /**
   * Get LSTM predictions (with error handling)
   */
  private async getLSTMPredictions(
    bookings: any[],
    futureDays: number
  ): Promise<EmptyContainerPrediction[] | null> {
    try {
      return await this.lstmService.getPredictions(bookings, futureDays);
    } catch (error) {
      console.error('LSTM prediction failed:', error);
      return null;
    }
  }

  /**
   * Get GBR predictions (with error handling)
   */
  private async getGBRPredictions(
    bookings: any[],
    futureDays: number
  ): Promise<GBRPrediction[] | null> {
    try {
      return await this.gbrService.getPredictions(bookings, futureDays);
    } catch (error) {
      console.error('GBR prediction failed:', error);
      return null;
    }
  }

  /**
   * Check if LSTM is available
   */
  private isLSTMAvailable(): boolean {
    try {
      const status = this.lstmService.getTrainingStatus();
      return status !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check if GBR is available
   */
  private isGBRAvailable(): boolean {
    try {
      const info = this.gbrService.getModelInfo();
      return info.isInitialized || false;
    } catch {
      return false;
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(): any {
    return {
      isInitialized: this.isInitialized,
      lstm: this.lstmService.getModelInfo(),
      gbr: this.gbrService.getModelInfo(),
      config: this.config,
      capabilities: [
        'Hybrid short-term and long-term predictions',
        'Automatic weight adjustment by horizon',
        'Confidence-based boosting',
        'Fallback to single model',
        'Feature importance from GBR',
        'Trend detection from LSTM'
      ]
    };
  }

  /**
   * Update ensemble configuration
   */
  updateConfig(newConfig: Partial<EnsembleConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('✅ Ensemble configuration updated');
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.lstmService.dispose();
    this.gbrService.dispose();
    console.log('🧹 Ensemble Prediction Service disposed');
  }
}
