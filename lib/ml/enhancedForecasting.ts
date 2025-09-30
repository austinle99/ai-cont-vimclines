/**
 * Enhanced Forecasting Module
 * Implements LSTM-Enhanced Exponential Smoothing and advanced forecasting techniques
 */

export interface ForecastingConfig {
  alpha: number; // Level smoothing parameter (0-1)
  beta: number;  // Trend smoothing parameter (0-1)
  gamma: number; // Seasonal smoothing parameter (0-1)
  seasonLength: number; // Number of periods in a season
  confidenceThreshold: number; // Minimum confidence for LSTM integration
}

export interface ForecastResult {
  forecast: number[];
  confidence: number[];
  method: string;
  timestamps: Date[];
  components: {
    level?: number[];
    trend?: number[];
    seasonal?: number[];
    lstm?: number[];
    traditional?: number[];
  };
}

export interface HistoricalPoint {
  timestamp: Date;
  value: number;
  metadata?: any;
}

export interface LSTMPrediction {
  value: number;
  confidence: number;
  timestamp: Date;
}

export class EnhancedForecastingEngine {
  private config: ForecastingConfig;

  constructor(config?: Partial<ForecastingConfig>) {
    this.config = {
      alpha: 0.2,      // Level smoothing - lower for stable data
      beta: 0.1,       // Trend smoothing - lower for less volatile trends
      gamma: 0.3,      // Seasonal smoothing - higher to capture seasonality
      seasonLength: 7, // Weekly seasonality for container logistics
      confidenceThreshold: 0.6, // Minimum LSTM confidence
      ...config
    };
  }

  /**
   * Main forecasting method - LSTM-Enhanced Exponential Smoothing
   */
  async generateForecast(
    historicalData: HistoricalPoint[],
    horizon: number,
    lstmPredictions?: LSTMPrediction[]
  ): Promise<ForecastResult> {
    if (historicalData.length < this.config.seasonLength * 2) {
      throw new Error(`Insufficient historical data. Need at least ${this.config.seasonLength * 2} points`);
    }

    console.log(`🔮 Generating enhanced forecast for ${horizon} periods...`);

    // Step 1: Generate traditional Holt-Winters forecast
    const traditionalForecast = this.holtWintersSeasonalForecast(historicalData, horizon);

    // Step 2: If LSTM predictions available, create hybrid forecast
    if (lstmPredictions && lstmPredictions.length > 0) {
      return this.createHybridForecast(traditionalForecast, lstmPredictions, horizon);
    }

    // Step 3: Return enhanced traditional forecast
    return this.enhanceTraditionalForecast(traditionalForecast, historicalData, horizon);
  }

  /**
   * Holt-Winters Seasonal Exponential Smoothing
   */
  private holtWintersSeasonalForecast(
    data: HistoricalPoint[],
    horizon: number
  ): ForecastResult {
    const values = data.map(d => d.value);
    const { alpha, beta, gamma, seasonLength } = this.config;

    // Initialize components
    const level: number[] = [];
    const trend: number[] = [];
    const seasonal: number[] = new Array(seasonLength).fill(1);
    const forecast: number[] = [];
    const confidence: number[] = [];

    // Calculate initial seasonal indices
    const avgPerSeason = this.calculateSeasonalAverages(values, seasonLength);
    const overallAvg = values.slice(0, seasonLength * 2).reduce((sum, val) => sum + val, 0) / (seasonLength * 2);

    for (let i = 0; i < seasonLength; i++) {
      seasonal[i] = avgPerSeason[i] / overallAvg;
    }

    // Initialize level and trend
    level[0] = values[0] / seasonal[0 % seasonLength];
    trend[0] = 0;

    // Holt-Winters iterations
    for (let t = 1; t < values.length; t++) {
      const seasonalIndex = t % seasonLength;

      // Update level
      const newLevel = alpha * (values[t] / seasonal[seasonalIndex]) +
                      (1 - alpha) * (level[t - 1] + trend[t - 1]);
      level[t] = newLevel;

      // Update trend
      const newTrend = beta * (level[t] - level[t - 1]) +
                      (1 - beta) * trend[t - 1];
      trend[t] = newTrend;

      // Update seasonal
      seasonal[seasonalIndex] = gamma * (values[t] / level[t]) +
                               (1 - gamma) * seasonal[seasonalIndex];
    }

    // Generate forecasts
    const lastLevel = level[level.length - 1];
    const lastTrend = trend[trend.length - 1];
    const timestamps: Date[] = [];

    for (let h = 1; h <= horizon; h++) {
      const seasonalIndex = (values.length + h - 1) % seasonLength;
      const forecastValue = (lastLevel + h * lastTrend) * seasonal[seasonalIndex];

      forecast.push(Math.max(0, forecastValue)); // Ensure non-negative

      // Calculate confidence based on historical accuracy
      const confidenceValue = this.calculateTraditionalConfidence(values, level, trend, seasonal, h);
      confidence.push(confidenceValue);

      // Generate timestamp
      const lastTimestamp = data[data.length - 1].timestamp;
      const newTimestamp = new Date(lastTimestamp.getTime() + h * 24 * 60 * 60 * 1000);
      timestamps.push(newTimestamp);
    }

    return {
      forecast,
      confidence,
      method: 'Holt-Winters Seasonal',
      timestamps,
      components: {
        level,
        trend,
        seasonal,
        traditional: forecast
      }
    };
  }

  /**
   * Create hybrid forecast combining LSTM and traditional methods
   */
  private createHybridForecast(
    traditionalResult: ForecastResult,
    lstmPredictions: LSTMPrediction[],
    horizon: number
  ): ForecastResult {
    const hybridForecast: number[] = [];
    const hybridConfidence: number[] = [];
    const timestamps: Date[] = [];

    console.log(`🤖 Creating hybrid forecast with LSTM confidence weighting...`);

    for (let i = 0; i < Math.min(horizon, lstmPredictions.length, traditionalResult.forecast.length); i++) {
      const lstmPred = lstmPredictions[i];
      const traditionalPred = traditionalResult.forecast[i];
      const traditionalConf = traditionalResult.confidence[i];

      // Dynamic weight calculation based on LSTM confidence
      const lstmWeight = Math.max(0, Math.min(1, lstmPred.confidence));
      const traditionalWeight = 1 - lstmWeight;

      // Weighted combination
      const hybridValue = (lstmWeight * lstmPred.value) + (traditionalWeight * traditionalPred);
      const hybridConf = (lstmWeight * lstmPred.confidence) + (traditionalWeight * traditionalConf);

      hybridForecast.push(Math.max(0, hybridValue));
      hybridConfidence.push(Math.min(0.95, hybridConf));
      timestamps.push(lstmPred.timestamp);
    }

    // Fill remaining periods with traditional forecast if needed
    for (let i = hybridForecast.length; i < horizon; i++) {
      if (i < traditionalResult.forecast.length) {
        hybridForecast.push(traditionalResult.forecast[i]);
        hybridConfidence.push(traditionalResult.confidence[i] * 0.8); // Reduce confidence for extrapolation
        timestamps.push(traditionalResult.timestamps[i]);
      }
    }

    return {
      forecast: hybridForecast,
      confidence: hybridConfidence,
      method: 'LSTM-Enhanced Holt-Winters',
      timestamps,
      components: {
        ...traditionalResult.components,
        lstm: lstmPredictions.map(p => p.value)
      }
    };
  }

  /**
   * Enhance traditional forecast with confidence intervals and trend analysis
   */
  private enhanceTraditionalForecast(
    traditionalResult: ForecastResult,
    historicalData: HistoricalPoint[],
    horizon: number
  ): ForecastResult {
    // Calculate trend strength and volatility
    const trendStrength = this.calculateTrendStrength(historicalData);
    const volatility = this.calculateVolatility(historicalData);

    // Adjust confidence based on data quality
    const enhancedConfidence = traditionalResult.confidence.map((conf, i) => {
      let adjustedConf = conf;

      // Reduce confidence for longer horizons
      adjustedConf *= Math.pow(0.95, i);

      // Adjust based on trend strength
      adjustedConf *= (0.8 + 0.2 * trendStrength);

      // Adjust based on volatility (higher volatility = lower confidence)
      adjustedConf *= Math.max(0.5, 1 - volatility * 0.5);

      return Math.max(0.1, Math.min(0.9, adjustedConf));
    });

    return {
      ...traditionalResult,
      confidence: enhancedConfidence,
      method: 'Enhanced Holt-Winters'
    };
  }

  /**
   * Multi-level demand forecasting for different aggregation levels
   */
  async generateMultiLevelForecast(
    portData: { [port: string]: HistoricalPoint[] },
    containerTypeData: { [type: string]: HistoricalPoint[] },
    totalData: HistoricalPoint[],
    horizon: number
  ): Promise<{
    portForecasts: { [port: string]: ForecastResult };
    containerTypeForecasts: { [type: string]: ForecastResult };
    totalForecast: ForecastResult;
  }> {
    console.log(`📊 Generating multi-level forecasts for ${Object.keys(portData).length} ports...`);

    // Generate forecasts for each level
    const portForecasts: { [port: string]: ForecastResult } = {};
    const containerTypeForecasts: { [type: string]: ForecastResult } = {};

    // Port-level forecasts
    for (const [port, data] of Object.entries(portData)) {
      if (data.length >= this.config.seasonLength * 2) {
        try {
          portForecasts[port] = await this.generateForecast(data, horizon);
        } catch (error) {
          console.warn(`⚠️  Could not generate forecast for port ${port}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    // Container type forecasts
    for (const [type, data] of Object.entries(containerTypeData)) {
      if (data.length >= this.config.seasonLength * 2) {
        try {
          containerTypeForecasts[type] = await this.generateForecast(data, horizon);
        } catch (error) {
          console.warn(`⚠️  Could not generate forecast for container type ${type}:`, error instanceof Error ? error.message : String(error));
        }
      }
    }

    // Total forecast
    const totalForecast = await this.generateForecast(totalData, horizon);

    return {
      portForecasts,
      containerTypeForecasts,
      totalForecast
    };
  }

  /**
   * Seasonal ARIMA parameters estimation
   */
  estimateARIMAParameters(data: HistoricalPoint[]): {
    p: number;
    d: number;
    q: number;
    P: number;
    D: number;
    Q: number;
    s: number;
  } {
    const values = data.map(d => d.value);

    // Simple parameter estimation based on data characteristics
    const seasonLength = this.detectSeasonalityPeriod(values);
    const differenceOrder = this.estimateDifferenceOrder(values);

    return {
      p: 1, // AR order - start simple
      d: differenceOrder,
      q: 1, // MA order - start simple
      P: 1, // Seasonal AR
      D: seasonLength > 0 ? 1 : 0, // Seasonal differencing
      Q: 1, // Seasonal MA
      s: seasonLength || 7 // Season length
    };
  }

  /**
   * Calculate optimal safety stock using enhanced formula
   */
  calculateOptimalSafetyStock(
    historicalDemand: HistoricalPoint[],
    leadTime: number,
    serviceLevel: number = 0.95
  ): {
    optimalSafety: number;
    leadTimeDemand: number;
    demandVariance: number;
    leadTimeVariance: number;
  } {
    const demands = historicalDemand.map(h => h.value);
    const avgDemand = demands.reduce((sum, d) => sum + d, 0) / demands.length;

    // Calculate demand variance
    const demandVariance = demands.reduce((sum, d) => sum + Math.pow(d - avgDemand, 2), 0) / (demands.length - 1);

    // Estimate lead time variance (simplified - could be enhanced with actual lead time data)
    const leadTimeVariance = leadTime * 0.1; // 10% coefficient of variation

    // Lead time demand
    const leadTimeDemand = avgDemand * leadTime;

    // Service level factor (Z-score for normal distribution)
    const zScore = this.getZScore(serviceLevel);

    // Enhanced safety stock formula
    const optimalSafety = Math.sqrt(
      leadTime * demandVariance +
      Math.pow(avgDemand, 2) * leadTimeVariance
    ) * zScore;

    return {
      optimalSafety: Math.ceil(optimalSafety),
      leadTimeDemand,
      demandVariance,
      leadTimeVariance
    };
  }

  // Helper methods
  private calculateSeasonalAverages(values: number[], seasonLength: number): number[] {
    const seasons = Math.floor(values.length / seasonLength);
    const averages: number[] = new Array(seasonLength).fill(0);

    for (let i = 0; i < seasonLength; i++) {
      let sum = 0;
      let count = 0;

      for (let s = 0; s < seasons; s++) {
        const index = s * seasonLength + i;
        if (index < values.length) {
          sum += values[index];
          count++;
        }
      }

      averages[i] = count > 0 ? sum / count : 1;
    }

    return averages;
  }

  private calculateTraditionalConfidence(
    values: number[],
    level: number[],
    trend: number[],
    seasonal: number[],
    horizon: number
  ): number {
    // Calculate historical accuracy to estimate confidence
    let totalError = 0;
    let count = 0;

    for (let i = Math.max(0, values.length - 20); i < values.length - 1; i++) {
      const seasonalIndex = (i + 1) % seasonal.length;
      const predicted = (level[i] + trend[i]) * seasonal[seasonalIndex];
      const actual = values[i + 1];

      if (actual > 0) {
        totalError += Math.abs(predicted - actual) / actual;
        count++;
      }
    }

    const avgError = count > 0 ? totalError / count : 0.2;
    const baseConfidence = Math.max(0.3, 1 - avgError);

    // Reduce confidence for longer horizons
    return baseConfidence * Math.pow(0.95, horizon - 1);
  }

  private calculateTrendStrength(data: HistoricalPoint[]): number {
    const values = data.map(d => d.value);
    if (values.length < 10) return 0.5;

    // Linear regression to measure trend
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgValue = sumY / n;

    // Normalize trend strength
    return Math.min(1, Math.abs(slope) / avgValue);
  }

  private calculateVolatility(data: HistoricalPoint[]): number {
    const values = data.map(d => d.value);
    if (values.length < 2) return 0.1;

    const returns = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0) {
        returns.push((values[i] - values[i - 1]) / values[i - 1]);
      }
    }

    if (returns.length === 0) return 0.1;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);

    return Math.sqrt(variance);
  }

  private detectSeasonalityPeriod(values: number[]): number {
    // Simple autocorrelation-based seasonality detection
    const maxLag = Math.min(30, Math.floor(values.length / 3));
    let bestLag = 0;
    let bestCorrelation = 0;

    for (let lag = 2; lag <= maxLag; lag++) {
      const correlation = this.calculateAutocorrelation(values, lag);
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    return bestCorrelation > 0.3 ? bestLag : 0;
  }

  private calculateAutocorrelation(values: number[], lag: number): number {
    if (values.length <= lag) return 0;

    const n = values.length - lag;
    const mean1 = values.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    const mean2 = values.slice(lag).reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;

    for (let i = 0; i < n; i++) {
      const diff1 = values[i] - mean1;
      const diff2 = values[i + lag] - mean2;

      numerator += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }

    return denom1 > 0 && denom2 > 0 ? numerator / Math.sqrt(denom1 * denom2) : 0;
  }

  private estimateDifferenceOrder(values: number[]): number {
    // Simple unit root test approximation
    let currentValues = [...values];
    let differenceOrder = 0;

    while (differenceOrder < 2 && this.hasUnitRoot(currentValues)) {
      currentValues = this.difference(currentValues);
      differenceOrder++;
    }

    return differenceOrder;
  }

  private hasUnitRoot(values: number[]): boolean {
    if (values.length < 10) return false;

    // Simple trend detection as proxy for unit root
    const trend = this.calculateTrendStrength([...values.map((v, i) => ({ timestamp: new Date(), value: v }))]);
    return trend > 0.1;
  }

  private difference(values: number[]): number[] {
    const result = [];
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] - values[i - 1]);
    }
    return result;
  }

  private getZScore(serviceLevel: number): number {
    // Z-scores for common service levels
    const zScores: { [key: string]: number } = {
      '0.90': 1.28,
      '0.95': 1.65,
      '0.975': 1.96,
      '0.99': 2.33,
      '0.995': 2.58
    };

    const key = serviceLevel.toString();
    return zScores[key] || 1.65; // Default to 95%
  }

  /**
   * Get forecasting configuration
   */
  getConfig(): ForecastingConfig {
    return { ...this.config };
  }

  /**
   * Update forecasting configuration
   */
  updateConfig(newConfig: Partial<ForecastingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}