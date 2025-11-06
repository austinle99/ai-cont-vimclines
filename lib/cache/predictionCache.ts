/**
 * In-Memory Prediction Cache
 * Caches predictions and database queries for fast retrieval
 * Uses LRU (Least Recently Used) eviction strategy
 */

import { EnsemblePrediction } from '@/lib/ml/ensemblePredictionService';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class PredictionCache {
  private static instance: PredictionCache | null = null;
  private predictionCache: Map<string, CacheEntry<EnsemblePrediction[]>>;
  private bookingCache: Map<string, CacheEntry<any[]>>;
  private maxSize: number;
  private defaultTTL: number; // Time to live in milliseconds

  private constructor(maxSize: number = 100, defaultTTL: number = 300000) {
    this.predictionCache = new Map();
    this.bookingCache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL; // Default 5 minutes
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PredictionCache {
    if (!this.instance) {
      this.instance = new PredictionCache();
    }
    return this.instance;
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(params: {
    days?: number;
    port?: string;
    containerType?: string;
    limit?: number;
  }): string {
    return JSON.stringify(params);
  }

  /**
   * Get cached predictions
   */
  getPredictions(
    days: number,
    port?: string,
    containerType?: string
  ): EnsemblePrediction[] | null {
    const key = this.generateKey({ days, port, containerType });
    const entry = this.predictionCache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.predictionCache.delete(key);
      return null;
    }

    console.log(`✅ Cache HIT: predictions (${key})`);
    return entry.data;
  }

  /**
   * Set cached predictions
   */
  setPredictions(
    predictions: EnsemblePrediction[],
    days: number,
    port?: string,
    containerType?: string,
    ttl?: number
  ): void {
    const key = this.generateKey({ days, port, containerType });

    // LRU eviction: remove oldest if at max size
    if (this.predictionCache.size >= this.maxSize) {
      const oldestKey = this.predictionCache.keys().next().value;
      if (oldestKey) {
        this.predictionCache.delete(oldestKey);
      }
    }

    const entry: CacheEntry<EnsemblePrediction[]> = {
      data: predictions,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttl || this.defaultTTL)
    };

    this.predictionCache.set(key, entry);
    console.log(`💾 Cache SET: predictions (${key}, TTL: ${(ttl || this.defaultTTL) / 1000}s)`);
  }

  /**
   * Get cached bookings
   */
  getBookings(
    port?: string,
    containerType?: string,
    limit?: number
  ): any[] | null {
    const key = this.generateKey({ port, containerType, limit });
    const entry = this.bookingCache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.bookingCache.delete(key);
      return null;
    }

    console.log(`✅ Cache HIT: bookings (${key})`);
    return entry.data;
  }

  /**
   * Set cached bookings
   */
  setBookings(
    bookings: any[],
    port?: string,
    containerType?: string,
    limit?: number,
    ttl?: number
  ): void {
    const key = this.generateKey({ port, containerType, limit });

    // LRU eviction
    if (this.bookingCache.size >= this.maxSize) {
      const oldestKey = this.bookingCache.keys().next().value;
      if (oldestKey) {
        this.bookingCache.delete(oldestKey);
      }
    }

    const entry: CacheEntry<any[]> = {
      data: bookings,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttl || this.defaultTTL)
    };

    this.bookingCache.set(key, entry);
    console.log(`💾 Cache SET: bookings (${key}, TTL: ${(ttl || this.defaultTTL) / 1000}s)`);
  }

  /**
   * Invalidate all caches (useful after data upload)
   */
  invalidateAll(): void {
    this.predictionCache.clear();
    this.bookingCache.clear();
    console.log('🧹 All caches invalidated');
  }

  /**
   * Invalidate predictions cache
   */
  invalidatePredictions(): void {
    this.predictionCache.clear();
    console.log('🧹 Prediction cache invalidated');
  }

  /**
   * Invalidate bookings cache
   */
  invalidateBookings(): void {
    this.bookingCache.clear();
    console.log('🧹 Booking cache invalidated');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    predictions: { size: number; maxSize: number };
    bookings: { size: number; maxSize: number };
    totalMemoryUsage: string;
  } {
    return {
      predictions: {
        size: this.predictionCache.size,
        maxSize: this.maxSize
      },
      bookings: {
        size: this.bookingCache.size,
        maxSize: this.maxSize
      },
      totalMemoryUsage: `~${Math.round((this.predictionCache.size + this.bookingCache.size) * 50 / 1024)}KB`
    };
  }

  /**
   * Clean up expired entries (garbage collection)
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    // Clean predictions cache
    for (const [key, entry] of this.predictionCache.entries()) {
      if (now > entry.expiresAt) {
        this.predictionCache.delete(key);
        cleaned++;
      }
    }

    // Clean bookings cache
    for (const [key, entry] of this.bookingCache.entries()) {
      if (now > entry.expiresAt) {
        this.bookingCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }
}

// Export singleton instance
export const predictionCache = PredictionCache.getInstance();

// Set up automatic cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    predictionCache.cleanup();
  }, 300000); // 5 minutes
}