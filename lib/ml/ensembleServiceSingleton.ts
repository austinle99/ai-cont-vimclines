/**
 * Singleton Ensemble Prediction Service
 * Prevents re-initialization on every request
 * Maintains model state across requests for optimal performance
 */

import { EnsemblePredictionService, EnsemblePrediction } from './ensemblePredictionService';

class EnsembleServiceSingleton {
  private static instance: EnsemblePredictionService | null = null;
  private static initializationPromise: Promise<EnsemblePredictionService> | null = null;
  private static isInitializing = false;

  /**
   * Get or create the singleton instance
   */
  static async getInstance(): Promise<EnsemblePredictionService> {
    // Return existing instance if already initialized
    if (this.instance) {
      return this.instance;
    }

    // Wait for ongoing initialization if in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this.initialize();
    return this.initializationPromise;
  }

  /**
   * Initialize the ensemble service (called once)
   */
  private static async initialize(): Promise<EnsemblePredictionService> {
    if (this.isInitializing) {
      throw new Error('Initialization already in progress');
    }

    this.isInitializing = true;

    try {
      console.log('🚀 Initializing Ensemble Service (singleton)...');
      const startTime = Date.now();

      // Create and initialize the service
      const service = new EnsemblePredictionService();
      await service.initialize();

      this.instance = service;
      this.isInitializing = false;

      const duration = Date.now() - startTime;
      console.log(`✅ Ensemble Service initialized in ${duration}ms`);

      return service;
    } catch (error) {
      this.isInitializing = false;
      this.initializationPromise = null;
      console.error('❌ Failed to initialize Ensemble Service:', error);
      throw error;
    }
  }

  /**
   * Reset the singleton (useful for testing or model retraining)
   */
  static async reset(): Promise<void> {
    if (this.instance) {
      this.instance.dispose();
      this.instance = null;
    }
    this.initializationPromise = null;
    this.isInitializing = false;
    console.log('🔄 Ensemble Service reset');
  }

  /**
   * Get predictions with automatic initialization
   */
  static async getPredictions(
    recentBookings: any[],
    futureDays: number = 7
  ): Promise<EnsemblePrediction[]> {
    const service = await this.getInstance();
    return service.getPredictions(recentBookings, futureDays);
  }

  /**
   * Train models with automatic initialization
   */
  static async trainModels(bookings: any[]): Promise<any> {
    const service = await this.getInstance();
    return service.trainModels(bookings);
  }

  /**
   * Get service status
   */
  static async getStatus(): Promise<any> {
    if (!this.instance) {
      return {
        initialized: false,
        message: 'Service not initialized'
      };
    }
    return {
      initialized: true,
      ...this.instance.getServiceStatus()
    };
  }

  /**
   * Check if service is ready
   */
  static isReady(): boolean {
    return this.instance !== null && !this.isInitializing;
  }
}

export default EnsembleServiceSingleton;