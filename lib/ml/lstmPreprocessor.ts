import * as tf from '@tensorflow/tfjs';

export interface TimeSeriesData {
  timestamp: Date;
  emptyContainerCount: number;
  totalBookings: number;
  port: string;
  containerType: string;
  depot?: string;
  utilizationRate: number;
  seasonalFactor: number;
}

export interface ProcessedTimeSeriesData {
  features: number[][];
  targets: number[];
  timestamps: Date[];
  scalingParams: {
    featureMin: number[];
    featureMax: number[];
    targetMin: number;
    targetMax: number;
  };
  metadata: {
    ports: string[];
    containerTypes: string[];
    sequenceLength: number;
    featureCount: number;
  };
}

export class LSTMDataPreprocessor {
  private sequenceLength: number;
  private predictionHorizon: number;

  constructor(sequenceLength: number = 30, predictionHorizon: number = 7) {
    this.sequenceLength = sequenceLength;
    this.predictionHorizon = predictionHorizon;
  }

  /**
   * Convert booking data to time series format
   */
  async prepareTimeSeriesFromBookings(bookings: any[]): Promise<TimeSeriesData[]> {
    // Group bookings by date, port, and container type
    const timeSeriesMap = new Map<string, TimeSeriesData>();

    for (const booking of bookings) {
      const date = new Date(booking.date);
      const dateKey = date.toISOString().split('T')[0];
      const port = booking.origin || booking.depot || 'unknown';
      const containerType = booking.size || '20GP';
      
      const key = `${dateKey}_${port}_${containerType}`;
      
      if (!timeSeriesMap.has(key)) {
        timeSeriesMap.set(key, {
          timestamp: date,
          emptyContainerCount: 0,
          totalBookings: 0,
          port,
          containerType,
          depot: booking.depot,
          utilizationRate: 0,
          seasonalFactor: this.calculateSeasonalFactor(date)
        });
      }

      const tsData = timeSeriesMap.get(key)!;
      tsData.totalBookings++;
      
      // Count empty containers
      if (booking.emptyLaden && booking.emptyLaden.toLowerCase().includes('empty')) {
        tsData.emptyContainerCount++;
      }
    }

    // Calculate utilization rates
    timeSeriesMap.forEach((data) => {
      data.utilizationRate = data.totalBookings > 0 
        ? (data.totalBookings - data.emptyContainerCount) / data.totalBookings 
        : 0;
    });

    return Array.from(timeSeriesMap.values()).sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Fill missing dates in time series with interpolation
   */
  fillMissingDates(data: TimeSeriesData[]): TimeSeriesData[] {
    if (data.length === 0) return data;

    const filled: TimeSeriesData[] = [];
    const sortedData = data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const start = new Date(sortedData[0].timestamp);
    const end = new Date(sortedData[sortedData.length - 1].timestamp);
    
    // Get unique port-type combinations
    const combinations = new Set(data.map(d => `${d.port}_${d.containerType}`));
    
    for (const combo of combinations) {
      const [port, containerType] = combo.split('_');
      const comboData = sortedData.filter(d => 
        d.port === port && d.containerType === containerType
      );
      
      const current = new Date(start);
      let dataIndex = 0;
      
      while (current <= end) {
        const dateKey = current.toISOString().split('T')[0];
        const existing = comboData.find(d => 
          d.timestamp.toISOString().split('T')[0] === dateKey
        );
        
        if (existing) {
          filled.push(existing);
          dataIndex++;
        } else {
          // Interpolate missing data
          const prev = dataIndex > 0 ? comboData[dataIndex - 1] : null;
          const next = dataIndex < comboData.length ? comboData[dataIndex] : null;
          
          filled.push({
            timestamp: new Date(current),
            emptyContainerCount: this.interpolateValue(prev?.emptyContainerCount || 0, next?.emptyContainerCount || 0),
            totalBookings: this.interpolateValue(prev?.totalBookings || 0, next?.totalBookings || 0),
            port,
            containerType,
            depot: prev?.depot || next?.depot,
            utilizationRate: this.interpolateValue(prev?.utilizationRate || 0, next?.utilizationRate || 0),
            seasonalFactor: this.calculateSeasonalFactor(current)
          });
        }
        
        current.setDate(current.getDate() + 1);
      }
    }
    
    return filled.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Create sequences for LSTM training
   */
  createSequences(data: TimeSeriesData[]): ProcessedTimeSeriesData {
    if (data.length < this.sequenceLength + this.predictionHorizon) {
      throw new Error(`Insufficient data: need at least ${this.sequenceLength + this.predictionHorizon} points, got ${data.length}`);
    }

    // Extract features and normalize
    const rawFeatures = data.map(d => [
      d.emptyContainerCount,
      d.totalBookings,
      d.utilizationRate,
      d.seasonalFactor,
      this.getDayOfWeek(d.timestamp),
      this.getDayOfMonth(d.timestamp),
      this.getMonth(d.timestamp)
    ]);

    const targets = data.map(d => d.emptyContainerCount);

    // Calculate scaling parameters
    const featureMin = Array.from({ length: rawFeatures[0].length }, (_, i) => 
      Math.min(...rawFeatures.map(f => f[i]))
    );
    const featureMax = Array.from({ length: rawFeatures[0].length }, (_, i) => 
      Math.max(...rawFeatures.map(f => f[i]))
    );
    const targetMin = Math.min(...targets);
    const targetMax = Math.max(...targets);

    // Normalize features
    const normalizedFeatures = rawFeatures.map(features =>
      features.map((value, i) => 
        featureMax[i] > featureMin[i] 
          ? (value - featureMin[i]) / (featureMax[i] - featureMin[i])
          : 0
      )
    );

    // Normalize targets
    const normalizedTargets = targets.map(target =>
      targetMax > targetMin 
        ? (target - targetMin) / (targetMax - targetMin)
        : 0
    );

    // Create sequences
    const sequences: number[][][] = [];
    const sequenceTargets: number[] = [];
    const sequenceTimestamps: Date[] = [];

    for (let i = 0; i <= data.length - this.sequenceLength - this.predictionHorizon; i++) {
      const sequence = normalizedFeatures.slice(i, i + this.sequenceLength);
      const target = normalizedTargets[i + this.sequenceLength + this.predictionHorizon - 1];
      
      sequences.push(sequence);
      sequenceTargets.push(target);
      sequenceTimestamps.push(data[i + this.sequenceLength].timestamp);
    }

    return {
      features: sequences,
      targets: sequenceTargets,
      timestamps: sequenceTimestamps,
      scalingParams: {
        featureMin,
        featureMax,
        targetMin,
        targetMax
      },
      metadata: {
        ports: [...new Set(data.map(d => d.port))],
        containerTypes: [...new Set(data.map(d => d.containerType))],
        sequenceLength: this.sequenceLength,
        featureCount: rawFeatures[0].length
      }
    };
  }

  /**
   * Convert processed data to TensorFlow tensors
   */
  createTensors(processedData: ProcessedTimeSeriesData): {
    xTrain: tf.Tensor3D;
    yTrain: tf.Tensor2D;
  } {
    const xTrain = tf.tensor3d(processedData.features);
    const yTrain = tf.tensor2d(processedData.targets, [processedData.targets.length, 1]);
    
    return { xTrain, yTrain };
  }

  /**
   * Denormalize predictions back to original scale
   */
  denormalizePredictions(normalizedPredictions: number[], scalingParams: ProcessedTimeSeriesData['scalingParams']): number[] {
    const { targetMin, targetMax } = scalingParams;
    
    return normalizedPredictions.map(pred => 
      pred * (targetMax - targetMin) + targetMin
    );
  }

  private calculateSeasonalFactor(date: Date): number {
    const month = date.getMonth();
    // Simple seasonal factor based on month (peak shipping seasons)
    const seasonalMap: { [key: number]: number } = {
      0: 0.8,  // January
      1: 0.9,  // February
      2: 1.1,  // March
      3: 1.2,  // April
      4: 1.3,  // May
      5: 1.4,  // June
      6: 1.3,  // July
      7: 1.2,  // August
      8: 1.4,  // September
      9: 1.5,  // October
      10: 1.3, // November
      11: 1.1  // December
    };
    
    return seasonalMap[month] || 1.0;
  }

  private interpolateValue(prev: number, next: number): number {
    return (prev + next) / 2;
  }

  private getDayOfWeek(date: Date): number {
    return date.getDay() / 6; // Normalize to 0-1
  }

  private getDayOfMonth(date: Date): number {
    return (date.getDate() - 1) / 30; // Normalize to 0-1
  }

  private getMonth(date: Date): number {
    return date.getMonth() / 11; // Normalize to 0-1
  }
}