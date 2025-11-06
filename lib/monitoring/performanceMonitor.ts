/**
 * Performance Monitoring Utility
 * Tracks API response times, cache hits, and system performance
 */

interface PerformanceMetric {
  endpoint: string;
  duration: number;
  timestamp: number;
  cached: boolean;
  status: 'success' | 'error';
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000; // Keep last 1000 requests

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!this.instance) {
      this.instance = new PerformanceMonitor();
    }
    return this.instance;
  }

  /**
   * Start timing a request
   */
  startTimer(endpoint: string): () => void {
    const startTime = performance.now();

    return (cached: boolean = false, status: 'success' | 'error' = 'success') => {
      const duration = performance.now() - startTime;
      this.recordMetric({
        endpoint,
        duration,
        timestamp: Date.now(),
        cached,
        status
      });
    };
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only last N metrics (LRU)
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow requests (> 1 second)
    if (metric.duration > 1000) {
      console.warn(`⚠️  SLOW REQUEST: ${metric.endpoint} took ${metric.duration.toFixed(2)}ms`);
    } else if (metric.duration < 100) {
      console.log(`⚡ FAST REQUEST: ${metric.endpoint} took ${metric.duration.toFixed(2)}ms (cached: ${metric.cached})`);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(endpoint?: string): {
    totalRequests: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    cacheHitRate: number;
    successRate: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    let metrics = this.metrics;

    if (endpoint) {
      metrics = this.metrics.filter(m => m.endpoint === endpoint);
    }

    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        cacheHitRate: 0,
        successRate: 0,
        p50: 0,
        p95: 0,
        p99: 0
      };
    }

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const cached = metrics.filter(m => m.cached).length;
    const successful = metrics.filter(m => m.status === 'success').length;

    return {
      totalRequests: metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      cacheHitRate: (cached / metrics.length) * 100,
      successRate: (successful / metrics.length) * 100,
      p50: this.getPercentile(durations, 50),
      p95: this.getPercentile(durations, 95),
      p99: this.getPercentile(durations, 99)
    };
  }

  /**
   * Get percentile value
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }

  /**
   * Get endpoint breakdown
   */
  getEndpointBreakdown(): Record<string, any> {
    const breakdown: Record<string, any> = {};

    const endpoints = [...new Set(this.metrics.map(m => m.endpoint))];

    for (const endpoint of endpoints) {
      breakdown[endpoint] = this.getStats(endpoint);
    }

    return breakdown;
  }

  /**
   * Get recent metrics (last N requests)
   */
  getRecentMetrics(count: number = 10): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    console.log('🧹 Performance metrics cleared');
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      stats: this.getStats(),
      breakdown: this.getEndpointBreakdown(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Log current performance summary
   */
  logSummary(): void {
    const stats = this.getStats();
    console.log('\n📊 Performance Summary:');
    console.log(`   Total Requests: ${stats.totalRequests}`);
    console.log(`   Avg Duration: ${stats.avgDuration.toFixed(2)}ms`);
    console.log(`   P95 Duration: ${stats.p95.toFixed(2)}ms`);
    console.log(`   P99 Duration: ${stats.p99.toFixed(2)}ms`);
    console.log(`   Cache Hit Rate: ${stats.cacheHitRate.toFixed(1)}%`);
    console.log(`   Success Rate: ${stats.successRate.toFixed(1)}%\n`);
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Middleware helper to add performance monitoring to API routes
 */
export function withPerformanceMonitoring(
  endpoint: string,
  handler: Function
): Function {
  return async (...args: any[]) => {
    const endTimer = performanceMonitor.startTimer(endpoint);

    try {
      const result = await handler(...args);
      endTimer(false, 'success');
      return result;
    } catch (error) {
      endTimer(false, 'error');
      throw error;
    }
  };
}