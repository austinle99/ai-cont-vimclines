/**
 * Longstay Prediction Service
 *
 * Uses machine learning to predict longstay risk for empty containers
 * Combines historical patterns, seasonal trends, and location-specific factors
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface LongstayFeatures {
  // Container characteristics
  containerType: string;
  emptyLaden: string;
  currentDwellDays: number;

  // Location factors
  currentLocation: string;
  locationHistoricalAvgDwell: number;
  locationEmptyRatio: number;
  locationUtilization: number;

  // Temporal factors
  dayOfWeek: number;
  weekOfYear: number;
  monthOfYear: number;
  isPeakSeason: boolean;
  daysUntilPeakSeason: number;

  // Historical patterns
  avgDwellTimeAllLocations: number;
  stdDevDwellTime: number;
  percentile75DwellTime: number;
  percentile90DwellTime: number;

  // Movement patterns
  movementFrequency: number; // Movements per week
  daysSinceLastMovement: number;
  isStagnant: boolean; // No movement for extended period

  // Demand signals
  recentPickupRate: number; // Pickups per week at location
  inventoryPressure: number; // Stock level vs capacity
  demandTrend: number; // Increasing or decreasing demand

  // Container-specific history
  previousLongstays: number; // Times this container had longstay
  averagePreviousDwell: number;
  containerAge: number; // Days since first seen
}

export interface LongstayPrediction {
  containerNo: string;
  currentDwellDays: number;
  predictedDwellDays: number;
  longstayProbability: number; // 0-1
  longstayRiskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1

  // Contributing factors
  topRiskFactors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;

  // Recommendations
  recommendedAction: string;
  suggestedDestination?: string;
  estimatedCostIfNoAction: number;
  potentialSavings: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';

  // Timeline
  daysUntilLongstay?: number; // Days until hitting longstay threshold
  predictedPickupDate?: Date;
}

export class LongstayPredictionService {
  private static instance: LongstayPredictionService;

  // Thresholds
  private readonly LONGSTAY_THRESHOLD = 14; // days
  private readonly CRITICAL_THRESHOLD = 21; // days
  private readonly STAGNANT_THRESHOLD = 7; // days without movement

  // Costs (configurable)
  private readonly DAILY_STORAGE_COST = 5; // USD
  private readonly RELOCATION_COST = 200; // USD
  private readonly URGENT_PICKUP_COST = 150; // USD

  private constructor() {}

  static getInstance(): LongstayPredictionService {
    if (!LongstayPredictionService.instance) {
      LongstayPredictionService.instance = new LongstayPredictionService();
    }
    return LongstayPredictionService.instance;
  }

  /**
   * Extract features for ML prediction
   */
  async extractFeatures(containerTracking: any): Promise<LongstayFeatures> {
    const currentDate = new Date();
    const currentLocation = containerTracking.currentLocation;

    // Get historical data for location
    const locationHistory = await prisma.containerTracking.findMany({
      where: {
        currentLocation,
        emptyLaden: containerTracking.emptyLaden,
        status: { in: ['picked-up', 'relocated', 'longstay'] }
      },
      select: {
        dwellDays: true,
        containerType: true,
        status: true
      },
      take: 200
    });

    const dwellTimes = locationHistory.map(h => h.dwellDays).filter(d => d > 0);
    const avgLocationDwell = dwellTimes.length > 0
      ? dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length
      : 14;

    const stdDevDwell = dwellTimes.length > 0
      ? Math.sqrt(
          dwellTimes.reduce((sq, n) => sq + Math.pow(n - avgLocationDwell, 2), 0) / dwellTimes.length
        )
      : 5;

    // Calculate percentiles
    const sortedDwell = [...dwellTimes].sort((a, b) => a - b);
    const p75Index = Math.floor(sortedDwell.length * 0.75);
    const p90Index = Math.floor(sortedDwell.length * 0.90);
    const percentile75 = sortedDwell[p75Index] || 14;
    const percentile90 = sortedDwell[p90Index] || 21;

    // Location empty ratio
    const emptyContainers = await prisma.containerTracking.count({
      where: { currentLocation, emptyLaden: 'empty', status: 'active' }
    });
    const totalContainers = await prisma.containerTracking.count({
      where: { currentLocation, status: 'active' }
    });
    const locationEmptyRatio = totalContainers > 0 ? emptyContainers / totalContainers : 0.5;

    // Recent pickup rate
    const recentPickups = await prisma.containerTracking.count({
      where: {
        currentLocation,
        status: 'picked-up',
        lastMovementDate: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });
    const recentPickupRate = recentPickups / 7; // Per day

    // Movement analysis
    const movements = (containerTracking.movementHistory as any)?.movements || [];
    const movementDates = movements.map((m: any) => new Date(m.date));
    const daysSinceLastMovement = movementDates.length > 0
      ? (currentDate.getTime() - movementDates[movementDates.length - 1].getTime()) / (1000 * 60 * 60 * 24)
      : containerTracking.dwellDays;

    const movementFrequency = movementDates.length > 1
      ? movementDates.length / ((currentDate.getTime() - movementDates[0].getTime()) / (1000 * 60 * 60 * 24 * 7))
      : 0;

    const isStagnant = movements.length >= 3 &&
      movements.slice(-3).every((m: any) => m.location === currentLocation);

    // Temporal features
    const dayOfWeek = currentDate.getDay();
    const weekOfYear = this.getWeekOfYear(currentDate);
    const monthOfYear = currentDate.getMonth();
    const peakSeasons = [0, 1, 10, 11]; // Jan, Feb, Nov, Dec
    const isPeakSeason = peakSeasons.includes(monthOfYear);

    // Days until next peak season
    let daysUntilPeak = 0;
    if (!isPeakSeason) {
      const nextPeakMonth = peakSeasons.find(m => m > monthOfYear) || peakSeasons[0];
      const nextPeakDate = new Date(currentDate.getFullYear(), nextPeakMonth, 1);
      if (nextPeakDate < currentDate) {
        nextPeakDate.setFullYear(nextPeakDate.getFullYear() + 1);
      }
      daysUntilPeak = (nextPeakDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
    }

    // Container age
    const containerAge = (currentDate.getTime() - new Date(containerTracking.firstSeenDate).getTime())
      / (1000 * 60 * 60 * 24);

    // Previous longstays (from iShip data)
    const previousLongstays = await prisma.iShipData.count({
      where: {
        containerNo: containerTracking.containerNo,
        gateInDate: { not: null },
        gateOutDate: { not: null }
      }
    });

    // Get inventory for location utilization
    const inventory = await prisma.inventory.findFirst({
      where: {
        port: currentLocation,
        type: containerTracking.containerType
      }
    });

    // Assume max capacity is 2x current stock as a heuristic
    const locationUtilization = inventory
      ? Math.min(inventory.stock / (inventory.stock * 2), 1)
      : 0.5;

    return {
      containerType: containerTracking.containerType,
      emptyLaden: containerTracking.emptyLaden,
      currentDwellDays: containerTracking.dwellDays,
      currentLocation,
      locationHistoricalAvgDwell: avgLocationDwell,
      locationEmptyRatio,
      locationUtilization,
      dayOfWeek,
      weekOfYear,
      monthOfYear,
      isPeakSeason,
      daysUntilPeakSeason: daysUntilPeak,
      avgDwellTimeAllLocations: avgLocationDwell,
      stdDevDwellTime: stdDevDwell,
      percentile75DwellTime: percentile75,
      percentile90DwellTime: percentile90,
      movementFrequency,
      daysSinceLastMovement,
      isStagnant,
      recentPickupRate,
      inventoryPressure: locationUtilization,
      demandTrend: recentPickupRate > 1 ? 1 : recentPickupRate > 0.5 ? 0 : -1,
      previousLongstays,
      averagePreviousDwell: avgLocationDwell,
      containerAge
    };
  }

  /**
   * Predict longstay risk using feature-based scoring model
   */
  async predict(containerTracking: any): Promise<LongstayPrediction> {
    const features = await this.extractFeatures(containerTracking);

    // Calculate risk score using weighted features
    let riskScore = 0;
    const topRiskFactors: Array<{ factor: string; impact: number; description: string }> = [];

    // Factor 1: Current dwell time vs historical average (0-25 points)
    const dwellRatio = features.currentDwellDays / features.locationHistoricalAvgDwell;
    const dwellImpact = Math.min(dwellRatio * 12.5, 25);
    riskScore += dwellImpact;
    if (dwellImpact > 15) {
      topRiskFactors.push({
        factor: 'Dwell Time',
        impact: dwellImpact,
        description: `${features.currentDwellDays} days (${(dwellRatio * 100).toFixed(0)}% above average)`
      });
    }

    // Factor 2: Absolute dwell time (0-20 points)
    let absoluteDwellImpact = 0;
    if (features.currentDwellDays >= this.CRITICAL_THRESHOLD) {
      absoluteDwellImpact = 20;
    } else if (features.currentDwellDays >= this.LONGSTAY_THRESHOLD) {
      absoluteDwellImpact = 15;
    } else if (features.currentDwellDays >= 7) {
      absoluteDwellImpact = 10;
    } else {
      absoluteDwellImpact = (features.currentDwellDays / 7) * 5;
    }
    riskScore += absoluteDwellImpact;

    // Factor 3: Empty container priority (0-15 points)
    const emptyImpact = features.emptyLaden === 'empty' ? 15 : 0;
    riskScore += emptyImpact;
    if (emptyImpact > 0) {
      topRiskFactors.push({
        factor: 'Empty Container',
        impact: emptyImpact,
        description: 'Empty containers have higher longstay risk'
      });
    }

    // Factor 4: Stagnation (0-15 points)
    const stagnantImpact = features.isStagnant ? 15 : 0;
    riskScore += stagnantImpact;
    if (stagnantImpact > 0) {
      topRiskFactors.push({
        factor: 'Stagnant Movement',
        impact: stagnantImpact,
        description: 'No location changes in recent movements'
      });
    }

    // Factor 5: Location empty ratio (0-10 points)
    const emptyRatioImpact = features.locationEmptyRatio * 10;
    riskScore += emptyRatioImpact;
    if (emptyRatioImpact > 7) {
      topRiskFactors.push({
        factor: 'Location Congestion',
        impact: emptyRatioImpact,
        description: `${(features.locationEmptyRatio * 100).toFixed(0)}% empty containers at location`
      });
    }

    // Factor 6: Low pickup rate (0-10 points)
    const pickupImpact = features.recentPickupRate < 0.5 ? 10 : features.recentPickupRate < 1 ? 5 : 0;
    riskScore += pickupImpact;
    if (pickupImpact > 0) {
      topRiskFactors.push({
        factor: 'Low Pickup Activity',
        impact: pickupImpact,
        description: `Only ${features.recentPickupRate.toFixed(1)} pickups/day at location`
      });
    }

    // Factor 7: Seasonal risk (0-5 points)
    const seasonalImpact = features.isPeakSeason ? 5 : 0;
    riskScore += seasonalImpact;

    // Normalize to 0-100
    riskScore = Math.min(riskScore, 100);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 80) riskLevel = 'critical';
    else if (riskScore >= 60) riskLevel = 'high';
    else if (riskScore >= 40) riskLevel = 'medium';
    else riskLevel = 'low';

    // Predict future dwell days
    const growthRate = features.isStagnant ? 0.5 : features.demandTrend < 0 ? 0.3 : 0.1;
    const predictedDwellDays = Math.round(
      features.currentDwellDays * (1 + growthRate)
    );

    // Calculate probability of longstay
    const longstayProbability = Math.min(riskScore / 100, 1);

    // Confidence based on data quality
    const confidence = Math.min(
      (features.movementFrequency > 0 ? 0.3 : 0.1) +
      (features.locationHistoricalAvgDwell > 0 ? 0.3 : 0.1) +
      (features.recentPickupRate > 0 ? 0.2 : 0.1) +
      0.2, // Base confidence
      1
    );

    // Determine recommended action
    const { recommendedAction, suggestedDestination, urgency } =
      await this.determineRecommendation(features, riskScore);

    // Calculate costs
    const estimatedCostIfNoAction = features.currentDwellDays * this.DAILY_STORAGE_COST +
      (predictedDwellDays - features.currentDwellDays) * this.DAILY_STORAGE_COST;

    let potentialSavings = 0;
    if (recommendedAction === 'urgent-pickup') {
      potentialSavings = estimatedCostIfNoAction - this.URGENT_PICKUP_COST;
    } else if (recommendedAction === 'relocate') {
      potentialSavings = estimatedCostIfNoAction * 0.6 - this.RELOCATION_COST;
    } else if (recommendedAction === 'schedule-pickup') {
      potentialSavings = estimatedCostIfNoAction * 0.4;
    }
    potentialSavings = Math.max(potentialSavings, 0);

    // Days until longstay
    const daysUntilLongstay = features.currentDwellDays < this.LONGSTAY_THRESHOLD
      ? this.LONGSTAY_THRESHOLD - features.currentDwellDays
      : 0;

    // Predicted pickup date (rough estimate)
    const predictedPickupDate = new Date();
    predictedPickupDate.setDate(predictedPickupDate.getDate() + predictedDwellDays);

    // Sort top risk factors by impact
    topRiskFactors.sort((a, b) => b.impact - a.impact);

    return {
      containerNo: containerTracking.containerNo,
      currentDwellDays: features.currentDwellDays,
      predictedDwellDays,
      longstayProbability,
      longstayRiskScore: riskScore,
      riskLevel,
      confidence,
      topRiskFactors: topRiskFactors.slice(0, 5),
      recommendedAction,
      suggestedDestination,
      estimatedCostIfNoAction,
      potentialSavings,
      urgency,
      daysUntilLongstay: daysUntilLongstay > 0 ? daysUntilLongstay : undefined,
      predictedPickupDate
    };
  }

  /**
   * Determine recommended action based on risk score and features
   */
  private async determineRecommendation(
    features: LongstayFeatures,
    riskScore: number
  ): Promise<{
    recommendedAction: string;
    suggestedDestination?: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  }> {
    let recommendedAction = 'monitor';
    let suggestedDestination: string | undefined;
    let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (riskScore >= 80) {
      recommendedAction = 'urgent-pickup';
      urgency = 'critical';
    } else if (riskScore >= 60) {
      recommendedAction = 'relocate';
      urgency = 'high';

      // Find optimal relocation destination
      const destinations = await this.findOptimalDestinations(features);
      if (destinations.length > 0) {
        suggestedDestination = destinations[0].location;
      }
    } else if (riskScore >= 40) {
      recommendedAction = 'schedule-pickup';
      urgency = 'medium';
    }

    return { recommendedAction, suggestedDestination, urgency };
  }

  /**
   * Find optimal destinations for relocation
   */
  private async findOptimalDestinations(features: LongstayFeatures) {
    const inventoryLevels = await prisma.inventory.findMany({
      where: {
        type: features.containerType,
        port: { not: features.currentLocation }
      },
      orderBy: { stock: 'asc' }
    });

    return inventoryLevels.map(inv => ({
      location: inv.port,
      stockLevel: inv.stock,
      score: 100 - (inv.stock / 100) * 100 // Simple scoring
    }));
  }

  /**
   * Utility: Get week of year
   */
  private getWeekOfYear(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Batch prediction for multiple containers
   */
  async predictBatch(containerTrackings: any[]): Promise<LongstayPrediction[]> {
    return Promise.all(
      containerTrackings.map(ct => this.predict(ct))
    );
  }
}

export default LongstayPredictionService.getInstance();
