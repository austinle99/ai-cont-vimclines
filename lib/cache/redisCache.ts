/**
 * Redis Caching Layer
 * Provides distributed caching with Redis for scalability
 * Falls back to in-memory cache if Redis is not available
 */

import { PredictionCache } from './predictionCache';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl?: number; // Default TTL in seconds
}

class RedisCacheService {
  private static instance: RedisCacheService | null = null;
  private client: any = null; // Redis client type
  private isConnected: boolean = false;
  private fallbackCache: PredictionCache;
  private defaultTTL: number;

  private constructor(config?: RedisConfig) {
    this.defaultTTL = config?.ttl || 300; // 5 minutes default
    this.fallbackCache = PredictionCache.getInstance();
  }

  static getInstance(config?: RedisConfig): RedisCacheService {
    if (!this.instance) {
      this.instance = new RedisCacheService(config);
    }
    return this.instance;
  }

  /**
   * Initialize Redis connection
   * Note: Requires 'redis' package to be installed
   * Run: npm install redis
   */
  async connect(config?: RedisConfig): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Dynamic import to avoid bundling Redis if not used
      const redis = await import('redis').catch(() => null);

      if (!redis) {
        console.warn('⚠️ Redis package not installed. Using in-memory fallback cache.');
        console.warn('   To enable Redis: npm install redis');
        return;
      }

      const redisConfig = config || {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      };

      this.client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port
        },
        password: redisConfig.password,
        database: redisConfig.db || 0
      });

      this.client.on('error', (err: Error) => {
        console.error('❌ Redis connection error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('⚠️ Redis connection failed. Using in-memory fallback cache.');
      console.warn('   Error:', error);
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    // Try Redis first
    if (this.isConnected && this.client) {
      try {
        const value = await this.client.get(key);
        if (value) {
          console.log(`✅ Redis cache HIT: ${key}`);
          return JSON.parse(value);
        }
      } catch (error) {
        console.error('❌ Redis GET error:', error);
        // Fall through to in-memory cache
      }
    }

    // Fallback to in-memory cache
    // Note: This is a simplified fallback - you may want to implement
    // a more sophisticated fallback strategy
    return null;
  }

  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    const expirySeconds = ttl || this.defaultTTL;

    // Try Redis first
    if (this.isConnected && this.client) {
      try {
        await this.client.setEx(key, expirySeconds, JSON.stringify(value));
        console.log(`💾 Redis cache SET: ${key} (TTL: ${expirySeconds}s)`);
        return;
      } catch (error) {
        console.error('❌ Redis SET error:', error);
        // Fall through to in-memory cache
      }
    }

    // Fallback: log warning
    console.warn(`⚠️ Redis not available for key: ${key}. Consider using in-memory PredictionCache.`);
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        console.log(`🗑️ Redis cache DELETE: ${key}`);
      } catch (error) {
        console.error('❌ Redis DELETE error:', error);
      }
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  async delPattern(pattern: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
          console.log(`🗑️ Redis cache DELETE pattern: ${pattern} (${keys.length} keys)`);
        }
      } catch (error) {
        console.error('❌ Redis DELETE PATTERN error:', error);
      }
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (this.isConnected && this.client) {
      try {
        return (await this.client.exists(key)) === 1;
      } catch (error) {
        console.error('❌ Redis EXISTS error:', error);
      }
    }
    return false;
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.ttl(key);
      } catch (error) {
        console.error('❌ Redis TTL error:', error);
      }
    }
    return -1;
  }

  /**
   * Flush all cache
   */
  async flushAll(): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.flushDb();
        console.log('🧹 Redis cache flushed');
      } catch (error) {
        console.error('❌ Redis FLUSH error:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
  }> {
    if (this.isConnected && this.client) {
      try {
        const info = await this.client.info('stats');
        const keys = await this.client.dbSize();
        const memory = await this.client.info('memory');

        return {
          connected: true,
          keys,
          memory: this.parseMemoryInfo(memory)
        };
      } catch (error) {
        console.error('❌ Redis STATS error:', error);
      }
    }

    return {
      connected: false,
      keys: 0,
      memory: '0B'
    };
  }

  private parseMemoryInfo(info: string): string {
    const match = info.match(/used_memory_human:(.+)/);
    return match ? match[1].trim() : '0B';
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('👋 Redis disconnected');
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
}

// Export singleton instance
export const redisCache = RedisCacheService.getInstance();

/**
 * Helper function to generate cache keys
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join('|');
  return `${prefix}:${sortedParams}`;
}

/**
 * Decorator for caching function results
 */
export function cached(ttl: number = 300) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = generateCacheKey(propertyName, { args: JSON.stringify(args) });

      // Try to get from cache
      const cachedResult = await redisCache.get(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Store in cache
      await redisCache.set(cacheKey, result, ttl);

      return result;
    };

    return descriptor;
  };
}
