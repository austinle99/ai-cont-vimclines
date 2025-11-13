/**
 * Global Model Warmup Service
 * Pre-loads and warms up ML models on application startup
 * Prevents cold starts and improves first prediction response time
 */

import { EnsemblePredictionService } from './ensemblePredictionService';

class ModelWarmupService {
  private static instance: ModelWarmupService | null = null;
  private ensembleService: EnsemblePredictionService | null = null;
  private isWarmedUp: boolean = false;
  private warmupPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): ModelWarmupService {
    if (!this.instance) {
      this.instance = new ModelWarmupService();
    }
    return this.instance;
  }

  /**
   * Warmup models on application startup
   * Can be called multiple times safely (uses singleton pattern)
   */
  async warmup(): Promise<void> {
    // If already warmed up, return immediately
    if (this.isWarmedUp) {
      return;
    }

    // If warmup is in progress, wait for it to complete
    if (this.warmupPromise) {
      return this.warmupPromise;
    }

    // Start warmup process
    this.warmupPromise = this.performWarmup();
    return this.warmupPromise;
  }

  private async performWarmup(): Promise<void> {
    const startTime = Date.now();
    console.log('🔥 Starting model warmup...');

    try {
      // Initialize ensemble service (loads GBR and LSTM models)
      this.ensembleService = EnsemblePredictionService.getInstance();
      await this.ensembleService.initialize();

      // Run a dummy prediction to fully warm up the models
      const dummyData = {
        port: 'WARMUP',
        containerType: '20GP',
        date: new Date(),
        historicalData: {
          emptyContainers: [10, 15, 12, 18, 20, 22, 25],
          ladenContainers: [50, 55, 52, 58, 60, 62, 65],
          dates: Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d;
          })
        }
      };

      // Warm up with a dummy prediction (result is discarded)
      await this.ensembleService.predict(dummyData).catch((err) => {
        console.warn('⚠️ Warmup prediction failed (this is normal if models are not trained):', err.message);
      });

      this.isWarmedUp = true;
      const duration = Date.now() - startTime;
      console.log(`✅ Model warmup completed in ${duration}ms`);
    } catch (error) {
      console.error('❌ Model warmup failed:', error);
      // Don't throw - allow app to start even if warmup fails
      this.isWarmedUp = false;
    } finally {
      this.warmupPromise = null;
    }
  }

  /**
   * Get the warmed-up ensemble service
   * Automatically triggers warmup if not already done
   */
  async getEnsembleService(): Promise<EnsemblePredictionService> {
    await this.warmup();

    if (!this.ensembleService) {
      throw new Error('Ensemble service not initialized');
    }

    return this.ensembleService;
  }

  /**
   * Check if models are warmed up
   */
  isReady(): boolean {
    return this.isWarmedUp;
  }

  /**
   * Reset warmup state (useful for testing or reloading models)
   */
  async reset(): Promise<void> {
    this.isWarmedUp = false;
    this.warmupPromise = null;
    this.ensembleService = null;
    console.log('🔄 Model warmup reset');
  }
}

// Export singleton instance
export const modelWarmup = ModelWarmupService.getInstance();

/**
 * Middleware helper to ensure models are warmed up before handling requests
 */
export async function ensureModelsWarmedUp(): Promise<void> {
  await modelWarmup.warmup();
}
