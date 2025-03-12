import Redis from 'ioredis';
import { config } from '../config/config';
import { log, logError } from '../utils/logger';

class RedisService {
  private redis: Redis | null = null;
  private inMemoryStorage: Map<string, any> = new Map();
  private isRedisAvailable: boolean = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis({
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: 1, // Reduce retries to fail fast
        retryStrategy: (times: number) => {
          if (times > 1) {
            this.isRedisAvailable = false;
            log.warn('Redis unavailable, using in-memory storage');
            return null; // Stop retrying
          }
          return 1000; // Try once more after 1 second
        }
      });

      this.redis.on('error', (err: Error) => {
        this.isRedisAvailable = false;
        logError(err, 'Redis connection error');
      });

      this.redis.on('connect', () => {
        this.isRedisAvailable = true;
        log.info('Redis connected successfully');
      });
    } catch (error) {
      this.isRedisAvailable = false;
      logError(error as Error, 'Redis initialization error');
    }
  }

  private getKey(type: string, userId: number, symbol?: string): string {
    return `${type}:${userId}${symbol ? ':' + symbol : ''}`;
  }

  // Price Alert Methods
  async setPriceAlert(userId: number, symbol: string, price: number, isAbove: boolean): Promise<void> {
    const key = this.getKey('alert', userId, symbol);
    const data = { symbol, price, isAbove };
    
    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.set(key, JSON.stringify(data));
      } else {
        this.inMemoryStorage.set(key, data);
      }
    } catch (error) {
      logError(error as Error, 'setPriceAlert');
      this.inMemoryStorage.set(key, data); // Fallback to in-memory
    }
  }

  async getPriceAlerts(userId: number): Promise<Record<string, any>> {
    const pattern = this.getKey('alert', userId, '*');
    const alerts: Record<string, any> = {};

    try {
      if (this.isRedisAvailable && this.redis) {
        const keys = await this.redis.keys(pattern);
        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            const symbol = key.split(':')[2];
            alerts[symbol] = JSON.parse(data);
          }
        }
      } else {
        // Get from in-memory storage
        for (const [key, value] of this.inMemoryStorage.entries()) {
          if (key.startsWith(`alert:${userId}`)) {
            const symbol = key.split(':')[2];
            alerts[symbol] = value;
          }
        }
      }
    } catch (error) {
      logError(error as Error, 'getPriceAlerts');
      // Return in-memory alerts as fallback
      return Object.fromEntries(
        Array.from(this.inMemoryStorage.entries())
          .filter(([key]) => key.startsWith(`alert:${userId}`))
          .map(([key, value]) => [key.split(':')[2], value])
      );
    }

    return alerts;
  }

  async removePriceAlert(userId: number, symbol: string, isAbove: boolean): Promise<void> {
    const key = this.getKey('alert', userId, symbol);
    if (this.isRedisAvailable && this.redis) {
      await this.redis.del(key);
    } else {
      this.inMemoryStorage.delete(key);
    }
    log.debug(`Removed price alert for user ${userId}: ${symbol}`);
  }

  // Cache Methods
  async setCacheWithExpiry(key: string, value: string, expirySeconds: number): Promise<void> {
    if (this.isRedisAvailable && this.redis) {
      await this.redis.set(key, value, 'EX', expirySeconds);
    } else {
      this.inMemoryStorage.set(key, value);
    }
  }

  async getCache(key: string): Promise<string | null> {
    if (this.isRedisAvailable && this.redis) {
      return await this.redis.get(key);
    } else {
      return this.inMemoryStorage.get(key) || null;
    }
  }

  async deleteCache(key: string): Promise<void> {
    if (this.isRedisAvailable && this.redis) {
      await this.redis.del(key);
    } else {
      this.inMemoryStorage.delete(key);
    }
  }

  // Portfolio Methods
  async setUserPortfolio(userId: number, portfolio: Record<string, number>): Promise<void> {
    const key = this.getKey('portfolio', userId);
    
    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.set(key, JSON.stringify(portfolio));
      } else {
        this.inMemoryStorage.set(key, portfolio);
      }
    } catch (error) {
      logError(error as Error, 'setUserPortfolio');
      this.inMemoryStorage.set(key, portfolio); // Fallback to in-memory
    }
  }

  async getUserPortfolio(userId: number): Promise<Record<string, number>> {
    const key = this.getKey('portfolio', userId);
    
    try {
      if (this.isRedisAvailable && this.redis) {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : {};
      } else {
        return this.inMemoryStorage.get(key) || {};
      }
    } catch (error) {
      logError(error as Error, 'getUserPortfolio');
      return this.inMemoryStorage.get(key) || {};
    }
  }

  // Webhook Methods
  async setWebhook(userId: number, url: string): Promise<void> {
    const key = this.getKey('webhook', userId);
    
    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.set(key, url);
      } else {
        this.inMemoryStorage.set(key, url);
      }
    } catch (error) {
      logError(error as Error, 'setWebhook');
      this.inMemoryStorage.set(key, url); // Fallback to in-memory
    }
  }

  async getWebhook(userId: number): Promise<string | null> {
    const key = this.getKey('webhook', userId);
    
    try {
      if (this.isRedisAvailable && this.redis) {
        return await this.redis.get(key);
      } else {
        return this.inMemoryStorage.get(key) || null;
      }
    } catch (error) {
      logError(error as Error, 'getWebhook');
      return this.inMemoryStorage.get(key) || null;
    }
  }

  async removeWebhook(userId: number): Promise<void> {
    const key = this.getKey('webhook', userId);
    if (this.isRedisAvailable && this.redis) {
      await this.redis.del(key);
    } else {
      this.inMemoryStorage.delete(key);
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    if (this.isRedisAvailable && this.redis) {
      await this.redis.quit();
    }
    log.info('Disconnected from Redis');
  }

  async clearUserAlerts(userId: number): Promise<void> {
    const pattern = this.getKey('alert', userId, '*');
    
    try {
      if (this.isRedisAvailable && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
      
      // Clear from in-memory storage
      for (const key of this.inMemoryStorage.keys()) {
        if (key.startsWith(`alert:${userId}`)) {
          this.inMemoryStorage.delete(key);
        }
      }
    } catch (error) {
      logError(error as Error, 'clearUserAlerts');
      // Clear only from in-memory as fallback
      for (const key of this.inMemoryStorage.keys()) {
        if (key.startsWith(`alert:${userId}`)) {
          this.inMemoryStorage.delete(key);
        }
      }
    }
  }
}

export const redisService = new RedisService(); 