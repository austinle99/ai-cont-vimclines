/**
 * GBR Feature Preparation Module
 * Converts container booking data into features suitable for Gradient Boosting Regression
 * Handles temporal features, lag features, rolling statistics, and aggregations
 */

export interface GBRFeature {
  // Direct features from Excel data
  dwell_time: number;
  total_movements: number;
  container_type: string;
  depot: string;
  empty_laden: number; // 0=laden, 1=empty

  // Temporal features
  day_of_week: number; // 0-6 (Sunday-Saturday)
  month: number; // 1-12
  week_of_year: number; // 1-52
  is_weekend: number; // 0 or 1
  is_month_start: number; // 0 or 1
  is_month_end: number; // 0 or 1

  // Lag features (look-back values)
  empty_count_lag_1: number;
  empty_count_lag_7: number;
  empty_count_lag_30: number;

  // Rolling statistics (trends)
  empty_rolling_mean_7: number;
  empty_rolling_std_7: number;
  empty_rolling_max_7: number;
  empty_rolling_min_7: number;
  dwell_rolling_mean_30: number;

  // Depot aggregations
  depot_empty_ratio: number;
  depot_total_containers: number;
  depot_avg_dwell_time: number;

  // Route features
  route_frequency: number;
  pol_pod_pair: string;

  // Optimization features (from existing system)
  optimization_score: number;

  // Target variable (for training)
  target_empty_count?: number;
}

export interface GBRFeatureSet {
  features: GBRFeature[];
  categorical_columns: string[];
  feature_stats: {
    total_features: number;
    numeric_features: number;
    categorical_features: number;
    temporal_features: number;
    lag_features: number;
    rolling_features: number;
  };
}

export interface DepotDailyStats {
  date: string;
  empty_count: number;
  total_count: number;
  avg_dwell_time: number;
  max_dwell_time: number;
}

export class GBRFeaturePreparator {
  private depotStatsCache: Map<string, Map<string, DepotDailyStats>>;
  private routeFrequencyCache: Map<string, number>;

  constructor() {
    this.depotStatsCache = new Map();
    this.routeFrequencyCache = new Map();
  }

  /**
   * Main method: Convert booking data to GBR features
   */
  prepareFeatures(bookings: any[], includeTarget: boolean = false): GBRFeatureSet {
    console.log(`📊 Preparing GBR features from ${bookings.length} booking records...`);

    if (bookings.length === 0) {
      throw new Error('No booking data provided for feature preparation');
    }

    // Sort by date for proper lag calculations
    const sortedBookings = [...bookings].sort((a, b) =>
      new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime()
    );

    // Pre-calculate aggregations for performance
    this.calculateDepotStats(sortedBookings);
    this.calculateRouteFrequencies(sortedBookings);

    // Generate features for each booking
    const features: GBRFeature[] = [];

    for (let i = 0; i < sortedBookings.length; i++) {
      const booking = sortedBookings[i];

      try {
        const feature = this.generateFeatureForBooking(booking, i, sortedBookings);
        features.push(feature);
      } catch (error) {
        console.warn(`⚠️  Failed to generate features for booking ${i}:`, error);
        // Continue with next booking
      }
    }

    console.log(`✅ Generated ${features.length} feature sets`);

    return {
      features,
      categorical_columns: ['depot', 'container_type', 'pol_pod_pair'],
      feature_stats: this.calculateFeatureStats()
    };
  }

  /**
   * Generate features for a single booking record
   */
  private generateFeatureForBooking(
    booking: any,
    index: number,
    allBookings: any[]
  ): GBRFeature {
    const date = new Date(booking.date || booking.createdAt || new Date());
    const depot = booking.depot || booking.origin || 'Unknown';
    const containerType = booking.size || '20GP';

    // Direct features
    const dwellTime = this.calculateDwellTime(booking);
    const totalMovements = booking.totalMovements || 1;
    const emptyLaden = this.isEmptyContainer(booking) ? 1 : 0;

    // Temporal features
    const temporalFeatures = this.extractTemporalFeatures(date);

    // Lag features
    const lagFeatures = this.calculateLagFeatures(depot, date, index, allBookings);

    // Rolling statistics
    const rollingFeatures = this.calculateRollingFeatures(depot, date, index, allBookings);

    // Depot aggregations
    const depotFeatures = this.getDepotAggregations(depot, date);

    // Route features
    const pol = booking.origin || booking.pol || depot;
    const pod = booking.destination || booking.pod || 'Unknown';
    const polPodPair = `${pol}->${pod}`;
    const routeFrequency = this.routeFrequencyCache.get(polPodPair) || 0;

    // Optimization features
    const optimizationScore = booking.optimizationScore || 50;

    // Target (for training)
    const targetEmptyCount = booking.predictedEmptyCount ||
                            booking.qty ||
                            (emptyLaden ? 1 : 0);

    return {
      // Direct features
      dwell_time: dwellTime,
      total_movements: totalMovements,
      container_type: containerType,
      depot: depot,
      empty_laden: emptyLaden,

      // Temporal features
      ...temporalFeatures,

      // Lag features
      ...lagFeatures,

      // Rolling features
      ...rollingFeatures,

      // Depot features
      ...depotFeatures,

      // Route features
      route_frequency: routeFrequency,
      pol_pod_pair: polPodPair,

      // Optimization features
      optimization_score: optimizationScore,

      // Target
      target_empty_count: targetEmptyCount
    };
  }

  /**
   * Calculate depot statistics for all depots and dates
   */
  private calculateDepotStats(bookings: any[]): void {
    console.log('📈 Calculating depot statistics...');

    this.depotStatsCache.clear();

    // Group by depot and date
    const depotDateGroups: Map<string, Map<string, any[]>> = new Map();

    for (const booking of bookings) {
      const depot = booking.depot || booking.origin || 'Unknown';
      const date = new Date(booking.date || booking.createdAt);
      const dateKey = date.toISOString().split('T')[0];

      if (!depotDateGroups.has(depot)) {
        depotDateGroups.set(depot, new Map());
      }

      const depotGroup = depotDateGroups.get(depot)!;
      if (!depotGroup.has(dateKey)) {
        depotGroup.set(dateKey, []);
      }

      depotGroup.get(dateKey)!.push(booking);
    }

    // Calculate stats for each depot-date combination
    for (const [depot, dateMap] of depotDateGroups.entries()) {
      const statsMap = new Map<string, DepotDailyStats>();

      for (const [dateKey, bookings] of dateMap.entries()) {
        const emptyCount = bookings.filter(b => this.isEmptyContainer(b)).length;
        const totalCount = bookings.length;
        const dwellTimes = bookings.map(b => this.calculateDwellTime(b));
        const avgDwellTime = dwellTimes.reduce((sum, d) => sum + d, 0) / dwellTimes.length;
        const maxDwellTime = Math.max(...dwellTimes);

        statsMap.set(dateKey, {
          date: dateKey,
          empty_count: emptyCount,
          total_count: totalCount,
          avg_dwell_time: avgDwellTime,
          max_dwell_time: maxDwellTime
        });
      }

      this.depotStatsCache.set(depot, statsMap);
    }

    console.log(`✅ Calculated stats for ${depotDateGroups.size} depots`);
  }

  /**
   * Calculate route frequencies
   */
  private calculateRouteFrequencies(bookings: any[]): void {
    console.log('🚢 Calculating route frequencies...');

    this.routeFrequencyCache.clear();

    const routeCounts: Map<string, number> = new Map();

    for (const booking of bookings) {
      const pol = booking.origin || booking.pol || booking.depot || 'Unknown';
      const pod = booking.destination || booking.pod || 'Unknown';

      if (pol === pod || pol === 'Unknown' || pod === 'Unknown') {
        continue;
      }

      const route = `${pol}->${pod}`;
      routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
    }

    this.routeFrequencyCache = routeCounts;
    console.log(`✅ Calculated ${routeCounts.size} unique routes`);
  }

  /**
   * Extract temporal features from date
   */
  private extractTemporalFeatures(date: Date): any {
    const dayOfWeek = date.getDay();
    const month = date.getMonth() + 1;
    const weekOfYear = this.getWeekOfYear(date);
    const dayOfMonth = date.getDate();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

    return {
      day_of_week: dayOfWeek,
      month: month,
      week_of_year: weekOfYear,
      is_weekend: (dayOfWeek === 0 || dayOfWeek === 6) ? 1 : 0,
      is_month_start: dayOfMonth <= 5 ? 1 : 0,
      is_month_end: dayOfMonth >= daysInMonth - 5 ? 1 : 0
    };
  }

  /**
   * Calculate lag features (look-back values)
   */
  private calculateLagFeatures(
    depot: string,
    currentDate: Date,
    currentIndex: number,
    allBookings: any[]
  ): any {
    const depotStats = this.depotStatsCache.get(depot);

    if (!depotStats) {
      return {
        empty_count_lag_1: 0,
        empty_count_lag_7: 0,
        empty_count_lag_30: 0
      };
    }

    return {
      empty_count_lag_1: this.getLagValue(depotStats, currentDate, 1),
      empty_count_lag_7: this.getLagValue(depotStats, currentDate, 7),
      empty_count_lag_30: this.getLagValue(depotStats, currentDate, 30)
    };
  }

  /**
   * Calculate rolling statistics (moving averages, std dev, etc.)
   */
  private calculateRollingFeatures(
    depot: string,
    currentDate: Date,
    currentIndex: number,
    allBookings: any[]
  ): any {
    const depotStats = this.depotStatsCache.get(depot);

    if (!depotStats) {
      return {
        empty_rolling_mean_7: 0,
        empty_rolling_std_7: 0,
        empty_rolling_max_7: 0,
        empty_rolling_min_7: 0,
        dwell_rolling_mean_30: 0
      };
    }

    // Get last 7 days of data
    const last7Days = this.getLastNDays(depotStats, currentDate, 7);
    const emptyCounts = last7Days.map(s => s.empty_count);

    // Get last 30 days for dwell time
    const last30Days = this.getLastNDays(depotStats, currentDate, 30);
    const dwellTimes = last30Days.map(s => s.avg_dwell_time);

    return {
      empty_rolling_mean_7: this.mean(emptyCounts),
      empty_rolling_std_7: this.std(emptyCounts),
      empty_rolling_max_7: emptyCounts.length > 0 ? Math.max(...emptyCounts) : 0,
      empty_rolling_min_7: emptyCounts.length > 0 ? Math.min(...emptyCounts) : 0,
      dwell_rolling_mean_30: this.mean(dwellTimes)
    };
  }

  /**
   * Get depot aggregation features
   */
  private getDepotAggregations(depot: string, date: Date): any {
    const depotStats = this.depotStatsCache.get(depot);
    const dateKey = date.toISOString().split('T')[0];

    if (!depotStats || !depotStats.has(dateKey)) {
      return {
        depot_empty_ratio: 0,
        depot_total_containers: 0,
        depot_avg_dwell_time: 0
      };
    }

    const stats = depotStats.get(dateKey)!;

    return {
      depot_empty_ratio: stats.total_count > 0 ? stats.empty_count / stats.total_count : 0,
      depot_total_containers: stats.total_count,
      depot_avg_dwell_time: stats.avg_dwell_time
    };
  }

  /**
   * Calculate dwell time from booking
   */
  private calculateDwellTime(booking: any): number {
    if (booking.dwellTime !== undefined && booking.dwellTime !== null) {
      return booking.dwellTime;
    }

    // Calculate from dates if available
    const currentDate = new Date(booking.date || booking.createdAt || new Date());
    const startDate = new Date(booking.startDate || booking.createdAt || currentDate);

    const dwellDays = Math.max(0, Math.ceil(
      (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ));

    return dwellDays;
  }

  /**
   * Check if container is empty
   */
  private isEmptyContainer(booking: any): boolean {
    if (booking.emptyLaden) {
      return booking.emptyLaden.toLowerCase().includes('empty');
    }

    if (booking.empty_laden) {
      return booking.empty_laden.toLowerCase().includes('empty');
    }

    // Default: assume laden
    return false;
  }

  /**
   * Get lag value (N days ago)
   */
  private getLagValue(
    depotStats: Map<string, DepotDailyStats>,
    currentDate: Date,
    lagDays: number
  ): number {
    const lagDate = new Date(currentDate);
    lagDate.setDate(lagDate.getDate() - lagDays);
    const lagDateKey = lagDate.toISOString().split('T')[0];

    const stats = depotStats.get(lagDateKey);
    return stats ? stats.empty_count : 0;
  }

  /**
   * Get last N days of stats
   */
  private getLastNDays(
    depotStats: Map<string, DepotDailyStats>,
    currentDate: Date,
    nDays: number
  ): DepotDailyStats[] {
    const result: DepotDailyStats[] = [];

    for (let i = 1; i <= nDays; i++) {
      const pastDate = new Date(currentDate);
      pastDate.setDate(pastDate.getDate() - i);
      const dateKey = pastDate.toISOString().split('T')[0];

      const stats = depotStats.get(dateKey);
      if (stats) {
        result.push(stats);
      }
    }

    return result;
  }

  /**
   * Get week of year
   */
  private getWeekOfYear(date: Date): number {
    const onejan = new Date(date.getFullYear(), 0, 1);
    const millisecsInDay = 86400000;
    return Math.ceil((((date.getTime() - onejan.getTime()) / millisecsInDay) + onejan.getDay() + 1) / 7);
  }

  /**
   * Calculate mean
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private std(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(val => Math.pow(val - avg, 2));
    const avgSquareDiff = this.mean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Calculate feature statistics
   */
  private calculateFeatureStats(): any {
    return {
      total_features: 26,
      numeric_features: 20,
      categorical_features: 3,
      temporal_features: 6,
      lag_features: 3,
      rolling_features: 5
    };
  }

  /**
   * Export features to JSON for Python processing
   */
  exportToJSON(featureSet: GBRFeatureSet): string {
    return JSON.stringify({
      features: featureSet.features,
      categorical_columns: featureSet.categorical_columns,
      feature_stats: featureSet.feature_stats
    }, null, 2);
  }

  /**
   * Clean up caches
   */
  clearCache(): void {
    this.depotStatsCache.clear();
    this.routeFrequencyCache.clear();
  }
}
