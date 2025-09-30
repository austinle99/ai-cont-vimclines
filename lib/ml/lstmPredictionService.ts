import { LSTMTrainingPipeline, TrainingMetrics } from './lstmTrainingPipeline';
import { PredictionResult } from './lstmModel';
import {
  EnhancedForecastingEngine,
  ForecastResult,
  HistoricalPoint,
  LSTMPrediction,
  ForecastingConfig
} from './enhancedForecasting';

export interface EmptyContainerPrediction {
  date: Date;
  predictedEmptyCount: number;
  confidence: number;
  port: string;
  containerType: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  riskLevel: 'low' | 'medium' | 'high';
  forecastMethod?: string;
  components?: {
    lstm?: number;
    traditional?: number;
    hybrid?: number;
  };
}

export interface PredictionInsight {
  summary: string;
  recommendations: string[];
  alertLevel: 'info' | 'warning' | 'critical';
  expectedImpact: {
    costImplication: string;
    operationalImpact: string;
    suggestedActions: string[];
  };
}

export interface TrainingStatus {
  isTraining: boolean;
  progress: number; // 0-100
  currentEpoch: number;
  totalEpochs: number;
  estimatedTimeRemaining: number; // minutes
  lastTrainingDate: Date | null;
  modelPerformance: TrainingMetrics | null;
}

export class LSTMPredictionService {
  private pipeline: LSTMTrainingPipeline;
  private trainingStatus: TrainingStatus;
  private isInitialized: boolean = false;
  private forecastingEngine: EnhancedForecastingEngine;

  constructor(forecastingConfig?: Partial<ForecastingConfig>) {
    this.pipeline = new LSTMTrainingPipeline({
      modelConfig: {
        lstmUnits: 64,
        dropout: 0.2,
        learningRate: 0.001,
        epochs: 50,
        batchSize: 16,
        validationSplit: 0.2
      },
      dataConfig: {
        sequenceLength: 30,
        predictionHorizon: 7,
        trainTestSplit: 0.8
      },
      retraining: {
        enabled: true,
        minNewSamples: 50,
        maxAge: 14 // retrain every 2 weeks
      }
    });

    // Initialize enhanced forecasting engine
    this.forecastingEngine = new EnhancedForecastingEngine({
      alpha: 0.2,
      beta: 0.1,
      gamma: 0.3,
      seasonLength: 7, // Weekly seasonality for containers
      confidenceThreshold: 0.6,
      ...forecastingConfig
    });

    this.trainingStatus = {
      isTraining: false,
      progress: 0,
      currentEpoch: 0,
      totalEpochs: 50,
      estimatedTimeRemaining: 0,
      lastTrainingDate: null,
      modelPerformance: null
    };
  }

  /**
   * Initialize the service and load existing model if available
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing LSTM Prediction Service...');

      // Try to load existing model
      await this.pipeline.loadModel();
      console.log('✅ Existing LSTM model loaded');

      this.isInitialized = true;
    } catch (error) {
      console.log('ℹ️  No existing LSTM model found, will need training');

      // Check if the error is a fetch error (model path issue)
      if (error instanceof Error && error.message.includes('fetch failed')) {
        console.warn('⚠️  Model loading failed due to network/path issues. Service will work in training-only mode.');
      }

      this.isInitialized = false;
      // Don't throw error - allow service to continue in training-only mode
    }
  }

  /**
   * Train or retrain the LSTM model
   */
  async trainModel(bookings: any[]): Promise<TrainingMetrics> {
    if (this.trainingStatus.isTraining) {
      throw new Error('Model is already training');
    }

    console.log('🤖 Starting LSTM model training...');
    this.trainingStatus.isTraining = true;
    this.trainingStatus.progress = 0;
    this.trainingStatus.currentEpoch = 0;

    try {
      const metrics = await this.pipeline.trainFromBookings(
        bookings,
        (progress) => {
          this.trainingStatus.currentEpoch = progress.epoch;
          this.trainingStatus.progress = (progress.epoch / this.trainingStatus.totalEpochs) * 100;
          
          // Estimate time remaining (rough calculation)
          const avgTimePerEpoch = 2; // seconds
          const remainingEpochs = this.trainingStatus.totalEpochs - progress.epoch;
          this.trainingStatus.estimatedTimeRemaining = (remainingEpochs * avgTimePerEpoch) / 60;

          console.log(`Training progress: ${this.trainingStatus.progress.toFixed(1)}% (${progress.epoch}/${this.trainingStatus.totalEpochs})`);
        }
      );

      // Save the trained model
      await this.pipeline.saveModel();

      this.trainingStatus = {
        ...this.trainingStatus,
        isTraining: false,
        progress: 100,
        lastTrainingDate: new Date(),
        modelPerformance: metrics
      };

      this.isInitialized = true;

      console.log('✅ LSTM model training completed');
      return metrics;

    } catch (error) {
      this.trainingStatus.isTraining = false;
      console.error('❌ LSTM training failed:', error);
      throw error;
    }
  }

  /**
   * Get empty container predictions using enhanced hybrid forecasting
   */
  async getPredictions(
    recentBookings: any[],
    futureDays: number = 7
  ): Promise<EmptyContainerPrediction[]> {
    if (!this.isInitialized) {
      // Try to use enhanced forecasting without LSTM as fallback
      console.log('⚠️  LSTM model not initialized, using enhanced forecasting fallback');
      return this.getFallbackPredictions(recentBookings, futureDays);
    }

    try {
      console.log(`🔮 Generating ${futureDays}-day enhanced predictions...`);

      // Get raw LSTM predictions
      const rawPredictions = await this.pipeline.predictEmptyContainers(
        recentBookings,
        futureDays
      );

      // Group recent bookings by port and container type
      const portTypeGroups = this.groupBookingsByPortAndType(recentBookings);

      // Generate enhanced predictions for each port/type combination
      const predictions: EmptyContainerPrediction[] = [];

      for (const [portType, bookingGroup] of Object.entries(portTypeGroups)) {
        const [port, containerType] = portType.split('_');

        // Prepare historical data for enhanced forecasting
        const historicalData = this.prepareHistoricalData(bookingGroup);

        // Create LSTM predictions for hybrid forecasting
        const lstmPredictions: LSTMPrediction[] = rawPredictions.timestamps.map((timestamp, i) => ({
          value: Math.max(0, rawPredictions.denormalizedPredictions[i] * (bookingGroup.length / 10)),
          confidence: rawPredictions.confidence[i],
          timestamp
        }));

        // Generate enhanced forecast
        const enhancedForecast = await this.generateEnhancedForecast(
          historicalData,
          lstmPredictions,
          futureDays
        );

        // Convert forecast to predictions
        for (let i = 0; i < enhancedForecast.forecast.length; i++) {
          const prediction: EmptyContainerPrediction = {
            date: enhancedForecast.timestamps[i],
            predictedEmptyCount: Math.max(0, Math.round(enhancedForecast.forecast[i])),
            confidence: enhancedForecast.confidence[i],
            port,
            containerType,
            trend: this.calculateTrend(enhancedForecast.forecast, i),
            riskLevel: this.calculateRiskLevel(enhancedForecast.forecast[i], enhancedForecast.confidence[i]),
            forecastMethod: enhancedForecast.method,
            components: {
              lstm: enhancedForecast.components?.lstm?.[i],
              traditional: enhancedForecast.components?.traditional?.[i],
              hybrid: enhancedForecast.forecast[i]
            }
          };

          predictions.push(prediction);
        }
      }

      console.log(`✅ Generated ${predictions.length} enhanced predictions using ${predictions[0]?.forecastMethod || 'hybrid'} method`);
      return predictions;

    } catch (error) {
      console.error('❌ Error generating enhanced predictions:', error);
      throw error;
    }
  }

  /**
   * Generate enhanced forecast using hybrid LSTM + traditional methods
   */
  private async generateEnhancedForecast(
    historicalData: HistoricalPoint[],
    lstmPredictions: LSTMPrediction[],
    horizon: number
  ): Promise<ForecastResult> {
    try {
      // Use hybrid forecasting if we have sufficient historical data
      if (historicalData.length >= 14) {
        return await this.forecastingEngine.generateForecast(
          historicalData,
          horizon,
          lstmPredictions
        );
      } else {
        // Fallback to LSTM-only forecast with confidence adjustment
        console.log('⚠️  Using LSTM-only forecast due to insufficient historical data');

        return {
          forecast: lstmPredictions.map(p => p.value),
          confidence: lstmPredictions.map(p => p.confidence * 0.8), // Reduce confidence for LSTM-only
          method: 'LSTM-Only (Insufficient Historical Data)',
          timestamps: lstmPredictions.map(p => p.timestamp),
          components: {
            lstm: lstmPredictions.map(p => p.value)
          }
        };
      }
    } catch (error) {
      console.warn('⚠️  Enhanced forecasting failed, falling back to LSTM:', error instanceof Error ? error.message : String(error));

      // Fallback to pure LSTM
      return {
        forecast: lstmPredictions.map(p => p.value),
        confidence: lstmPredictions.map(p => p.confidence * 0.9),
        method: 'LSTM-Fallback',
        timestamps: lstmPredictions.map(p => p.timestamp),
        components: {
          lstm: lstmPredictions.map(p => p.value)
        }
      };
    }
  }

  /**
   * Get prediction insights and recommendations
   */
  async getPredictionInsights(predictions: EmptyContainerPrediction[]): Promise<PredictionInsight> {
    const highRiskPredictions = predictions.filter(p => p.riskLevel === 'high');
    const increasingTrends = predictions.filter(p => p.trend === 'increasing');
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;

    let alertLevel: 'info' | 'warning' | 'critical' = 'info';
    const recommendations: string[] = [];

    // Analyze patterns
    if (highRiskPredictions.length > predictions.length * 0.3) {
      alertLevel = 'critical';
      recommendations.push('High risk of empty container accumulation detected');
      recommendations.push('Consider immediate redistribution actions');
    } else if (increasingTrends.length > predictions.length * 0.5) {
      alertLevel = 'warning';
      recommendations.push('Empty container counts trending upward');
      recommendations.push('Monitor storage capacity and plan proactive measures');
    }

    if (avgConfidence < 0.7) {
      recommendations.push('Prediction confidence is moderate - consider collecting more recent data');
    }

    // Port-specific recommendations
    const portSummary = this.getPortSummary(predictions);
    for (const [port, summary] of Object.entries(portSummary)) {
      if (summary.avgEmptyCount > 20) {
        recommendations.push(`${port}: Expected high empty container volume (${summary.avgEmptyCount.toFixed(0)})`);
      }
    }

    const insight: PredictionInsight = {
      summary: this.generateSummary(predictions, alertLevel),
      recommendations,
      alertLevel,
      expectedImpact: {
        costImplication: this.calculateCostImplication(predictions),
        operationalImpact: this.calculateOperationalImpact(predictions),
        suggestedActions: this.generateSuggestedActions(predictions, alertLevel)
      }
    };

    return insight;
  }

  /**
   * Check if model needs retraining
   */
  async checkRetrainingNeeded(newBookings: any[]): Promise<boolean> {
    return this.pipeline.shouldRetrain(newBookings.length);
  }

  /**
   * Get training status
   */
  getTrainingStatus(): TrainingStatus {
    return { ...this.trainingStatus };
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return this.pipeline.getModelInfo();
  }

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

  private prepareHistoricalData(bookings: any[]): HistoricalPoint[] {
    // Group bookings by date and calculate daily empty container counts
    const dailyData: { [date: string]: number } = {};

    for (const booking of bookings) {
      const date = booking.date || booking.createdAt || new Date();
      const dateKey = new Date(date).toISOString().split('T')[0];

      // Estimate empty containers based on booking activity
      // This is a simplified approach - you might want to use actual empty container data
      const emptyCount = booking.qty || 1;

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = 0;
      }
      dailyData[dateKey] += emptyCount;
    }

    // Convert to HistoricalPoint array and sort by date
    const historicalPoints: HistoricalPoint[] = Object.entries(dailyData)
      .map(([dateStr, value]) => ({
        timestamp: new Date(dateStr),
        value,
        metadata: { bookingCount: bookings.filter(b =>
          new Date(b.date || b.createdAt).toISOString().split('T')[0] === dateStr
        ).length }
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return historicalPoints;
  }

  private calculateTrend(predictions: number[], currentIndex: number): 'increasing' | 'decreasing' | 'stable' {
    if (currentIndex === 0) return 'stable';

    const current = predictions[currentIndex];
    const previous = predictions[currentIndex - 1];
    const threshold = 0.1; // 10% change threshold

    const change = (current - previous) / previous;

    if (change > threshold) return 'increasing';
    if (change < -threshold) return 'decreasing';
    return 'stable';
  }

  private calculateRiskLevel(prediction: number, confidence: number): 'low' | 'medium' | 'high' {
    // Risk is high when prediction is high AND confidence is high
    const normalizedPrediction = Math.min(prediction / 50, 1); // normalize to 0-1

    const riskScore = normalizedPrediction * confidence;

    if (riskScore > 0.7) return 'high';
    if (riskScore > 0.4) return 'medium';
    return 'low';
  }

  private getPortSummary(predictions: EmptyContainerPrediction[]) {
    const portSummary: { [port: string]: { avgEmptyCount: number; maxRisk: string } } = {};

    for (const prediction of predictions) {
      if (!portSummary[prediction.port]) {
        portSummary[prediction.port] = { avgEmptyCount: 0, maxRisk: 'low' };
      }

      // We need to calculate averages properly - this is a simplified version
      const existingAvg = portSummary[prediction.port].avgEmptyCount;
      portSummary[prediction.port].avgEmptyCount = (existingAvg + prediction.predictedEmptyCount) / 2;

      if (prediction.riskLevel === 'high') {
        portSummary[prediction.port].maxRisk = 'high';
      } else if (prediction.riskLevel === 'medium' && portSummary[prediction.port].maxRisk === 'low') {
        portSummary[prediction.port].maxRisk = 'medium';
      }
    }

    return portSummary;
  }

  private generateSummary(predictions: EmptyContainerPrediction[], alertLevel: string): string {
    const avgEmpty = predictions.reduce((sum, p) => sum + p.predictedEmptyCount, 0) / predictions.length;
    const daysAhead = predictions.length > 0 ? 
      Math.ceil((predictions[predictions.length - 1].date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

    let summary = `Predicted ${avgEmpty.toFixed(0)} average empty containers over next ${daysAhead} days`;

    if (alertLevel === 'critical') {
      summary += '. CRITICAL: Immediate action required to prevent accumulation.';
    } else if (alertLevel === 'warning') {
      summary += '. WARNING: Monitor closely and prepare contingency measures.';
    } else {
      summary += '. Container levels appear manageable.';
    }

    return summary;
  }

  private calculateCostImplication(predictions: EmptyContainerPrediction[]): string {
    const totalPredictedEmpty = predictions.reduce((sum, p) => sum + p.predictedEmptyCount, 0);
    const avgStorageCostPerContainer = 5; // $5 per day per container
    const estimatedCost = totalPredictedEmpty * avgStorageCostPerContainer;

    return `Estimated storage cost: $${estimatedCost.toLocaleString()} over prediction period`;
  }

  private calculateOperationalImpact(predictions: EmptyContainerPrediction[]): string {
    const highRiskDays = predictions.filter(p => p.riskLevel === 'high').length;
    const totalDays = predictions.length;

    if (highRiskDays > totalDays * 0.5) {
      return 'High operational impact expected - storage capacity constraints likely';
    } else if (highRiskDays > totalDays * 0.25) {
      return 'Moderate operational impact - some capacity management required';
    } else {
      return 'Low operational impact - standard operations should suffice';
    }
  }

  private generateSuggestedActions(predictions: EmptyContainerPrediction[], alertLevel: string): string[] {
    const actions: string[] = [];

    if (alertLevel === 'critical') {
      actions.push('Implement immediate empty container redistribution program');
      actions.push('Contact regional depots for emergency storage options');
      actions.push('Prioritize export bookings to reduce empty inventory');
    } else if (alertLevel === 'warning') {
      actions.push('Schedule proactive empty container repositioning');
      actions.push('Review upcoming export opportunities');
      actions.push('Prepare additional storage arrangements');
    } else {
      actions.push('Continue standard empty container management procedures');
      actions.push('Monitor trends for early warning indicators');
    }

    // Port-specific actions
    const portCounts = predictions.reduce((acc, p) => {
      acc[p.port] = (acc[p.port] || 0) + p.predictedEmptyCount;
      return acc;
    }, {} as { [port: string]: number });

    const topPort = Object.entries(portCounts).sort(([, a], [, b]) => b - a)[0];
    if (topPort && topPort[1] > 50) {
      actions.push(`Focus on ${topPort[0]} - highest predicted empty volume (${topPort[1].toFixed(0)} containers)`);
    }

    return actions;
  }

  /**
   * Generate multi-level forecasts for different aggregation levels
   */
  async getMultiLevelPredictions(
    bookings: any[],
    futureDays: number = 7
  ): Promise<{
    portForecasts: { [port: string]: ForecastResult };
    containerTypeForecasts: { [type: string]: ForecastResult };
    totalForecast: ForecastResult;
  }> {
    console.log(`📊 Generating multi-level forecasts for ${futureDays} days...`);

    // Group bookings by different dimensions
    const portData: { [port: string]: HistoricalPoint[] } = {};
    const containerTypeData: { [type: string]: HistoricalPoint[] } = {};
    const totalData: HistoricalPoint[] = [];

    // Group by port
    const portGroups = this.groupBookingsByPort(bookings);
    for (const [port, portBookings] of Object.entries(portGroups)) {
      portData[port] = this.prepareHistoricalData(portBookings);
    }

    // Group by container type
    const typeGroups = this.groupBookingsByType(bookings);
    for (const [type, typeBookings] of Object.entries(typeGroups)) {
      containerTypeData[type] = this.prepareHistoricalData(typeBookings);
    }

    // Total data
    totalData.push(...this.prepareHistoricalData(bookings));

    // Generate multi-level forecasts
    return await this.forecastingEngine.generateMultiLevelForecast(
      portData,
      containerTypeData,
      totalData,
      futureDays
    );
  }

  /**
   * Calculate optimal safety stock for inventory management
   */
  async calculateOptimalSafetyStock(
    inventoryData: any,
    historicalBookings: any[],
    serviceLevel: number = 0.95,
    leadTime: number = 3
  ): Promise<{
    currentSafety: number;
    optimalSafety: number;
    recommendation: string;
    leadTimeDemand: number;
    confidence: number;
  }> {
    console.log(`🎯 Calculating optimal safety stock for ${inventoryData.port} ${inventoryData.type}...`);

    // Filter relevant historical data
    const relevantBookings = historicalBookings.filter(booking =>
      (booking.destination === inventoryData.port || booking.origin === inventoryData.port) &&
      booking.size === inventoryData.type
    );

    if (relevantBookings.length < 10) {
      return {
        currentSafety: inventoryData.safetyStock || 10,
        optimalSafety: inventoryData.safetyStock || 10,
        recommendation: 'Insufficient historical data for optimization',
        leadTimeDemand: 0,
        confidence: 0.3
      };
    }

    const historicalDemand = this.prepareHistoricalData(relevantBookings);

    // Calculate optimal safety stock using enhanced formula
    const safetyResult = this.forecastingEngine.calculateOptimalSafetyStock(
      historicalDemand,
      leadTime,
      serviceLevel
    );

    const currentSafety = inventoryData.safetyStock || 10;
    const difference = safetyResult.optimalSafety - currentSafety;

    let recommendation = '';
    if (Math.abs(difference) < 2) {
      recommendation = 'Current safety stock is optimal';
    } else if (difference > 0) {
      recommendation = `Increase safety stock by ${difference} units to improve service level`;
    } else {
      recommendation = `Reduce safety stock by ${Math.abs(difference)} units to optimize costs`;
    }

    return {
      currentSafety,
      optimalSafety: safetyResult.optimalSafety,
      recommendation,
      leadTimeDemand: safetyResult.leadTimeDemand,
      confidence: historicalDemand.length > 30 ? 0.85 : 0.65
    };
  }

  /**
   * Get forecasting configuration
   */
  getForecastingConfig(): ForecastingConfig {
    return this.forecastingEngine.getConfig();
  }

  /**
   * Update forecasting configuration
   */
  updateForecastingConfig(newConfig: Partial<ForecastingConfig>): void {
    this.forecastingEngine.updateConfig(newConfig);
  }

  private groupBookingsByPort(bookings: any[]): { [port: string]: any[] } {
    const groups: { [port: string]: any[] } = {};

    for (const booking of bookings) {
      const port = booking.origin || booking.depot || 'unknown';

      if (!groups[port]) {
        groups[port] = [];
      }
      groups[port].push(booking);
    }

    return groups;
  }

  private groupBookingsByType(bookings: any[]): { [type: string]: any[] } {
    const groups: { [type: string]: any[] } = {};

    for (const booking of bookings) {
      const containerType = booking.size || '20GP';

      if (!groups[containerType]) {
        groups[containerType] = [];
      }
      groups[containerType].push(booking);
    }

    return groups;
  }

  /**
   * Fallback predictions when LSTM is not available
   */
  private async getFallbackPredictions(
    recentBookings: any[],
    futureDays: number = 7
  ): Promise<EmptyContainerPrediction[]> {
    console.log(`📊 Generating ${futureDays}-day fallback predictions using enhanced forecasting...`);

    const predictions: EmptyContainerPrediction[] = [];

    try {
      // Group recent bookings by port and container type
      const portTypeGroups = this.groupBookingsByPortAndType(recentBookings);

      for (const [portType, bookingGroup] of Object.entries(portTypeGroups)) {
        const [port, containerType] = portType.split('_');

        // Prepare historical data for enhanced forecasting
        const historicalData = this.prepareHistoricalData(bookingGroup);

        if (historicalData.length < 7) {
          // Not enough data for forecasting, use simple estimation
          const avgDaily = bookingGroup.length / 30; // Assume bookings span 30 days
          for (let i = 0; i < futureDays; i++) {
            predictions.push({
              date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
              predictedEmptyCount: Math.max(1, Math.round(avgDaily * 2)), // Estimate empty containers
              confidence: 0.4, // Lower confidence for simple estimation
              port,
              containerType,
              trend: 'stable',
              riskLevel: 'low',
              forecastMethod: 'Simple-Estimation',
              components: {
                traditional: Math.round(avgDaily * 2)
              }
            });
          }
          continue;
        }

        // Use enhanced forecasting engine
        const forecast = await this.forecastingEngine.generateForecast(
          historicalData,
          futureDays
        );

        // Convert forecast to predictions
        for (let i = 0; i < forecast.forecast.length; i++) {
          const prediction: EmptyContainerPrediction = {
            date: forecast.timestamps[i],
            predictedEmptyCount: Math.max(0, Math.round(forecast.forecast[i])),
            confidence: forecast.confidence[i],
            port,
            containerType,
            trend: this.calculateTrend(forecast.forecast, i),
            riskLevel: this.calculateRiskLevel(forecast.forecast[i], forecast.confidence[i]),
            forecastMethod: forecast.method,
            components: {
              traditional: forecast.components?.traditional?.[i],
              hybrid: forecast.forecast[i]
            }
          };

          predictions.push(prediction);
        }
      }

      console.log(`✅ Generated ${predictions.length} fallback predictions`);
      return predictions;

    } catch (error) {
      console.error('❌ Error generating fallback predictions:', error);
      // Return minimal predictions to prevent complete failure
      return this.getMinimalPredictions(futureDays);
    }
  }

  /**
   * Generate minimal predictions when all else fails
   */
  private getMinimalPredictions(futureDays: number): EmptyContainerPrediction[] {
    const predictions: EmptyContainerPrediction[] = [];

    for (let i = 0; i < futureDays; i++) {
      predictions.push({
        date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        predictedEmptyCount: 10, // Conservative estimate
        confidence: 0.3,
        port: 'Unknown',
        containerType: '20GP',
        trend: 'stable',
        riskLevel: 'low',
        forecastMethod: 'Minimal-Fallback',
        components: {
          traditional: 10
        }
      });
    }

    return predictions;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.pipeline.dispose();
  }
}