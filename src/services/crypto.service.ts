import axios from 'axios';
import { redisService } from './redis.service';
import { log, logError } from '../utils/logger';

interface PriceData {
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
}

interface PriceAlert {
  condition: 'above' | 'below';
  price: number;
  userId: number;
}

interface CoinGeckoPrice {
  usd: number;
  usd_24h_change: number;
  usd_24h_vol: number;
  usd_market_cap: number;
}

interface MarketChartPoint {
  timestamp: number;
  price: number;
}

interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
}

type PriceUpdateCallback = (symbol: string, price: number) => void;

class CryptoService {
  private readonly API_BASE_URL = 'https://api.coingecko.com/api/v3';
  private priceUpdateCallbacks: Map<string, PriceUpdateCallback[]>;
  private monitoredSymbols: Set<string>;
  private updateInterval: NodeJS.Timeout | null;

  constructor() {
    this.priceUpdateCallbacks = new Map();
    this.monitoredSymbols = new Set();
    this.updateInterval = null;
  }

  async startPriceMonitoring(symbols: string[] = ['polkadot']) {
    try {
      log.info('Starting price monitoring service');
      symbols.forEach(symbol => this.monitoredSymbols.add(symbol));

      // Clear any existing interval
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }

      // Update prices every 30 seconds
      this.updateInterval = setInterval(async () => {
        try {
          const prices = await this.getPrices(Array.from(this.monitoredSymbols));
          for (const [symbol, data] of Object.entries(prices)) {
            await this.handlePriceUpdate(symbol, data);
          }
        } catch (error) {
          logError(error as Error, 'CryptoService.updatePrices');
        }
      }, 30000);

      log.info('Price monitoring service started successfully');
    } catch (error) {
      logError(error as Error, 'CryptoService.startPriceMonitoring');
      throw error;
    }
  }

  private async handlePriceUpdate(symbol: string, data: PriceData) {
    try {
      await redisService.setCacheWithExpiry(
        `price:${symbol}`,
        JSON.stringify(data),
        300
      );

      const alerts = await redisService.getPriceAlerts(symbol);
      for (const alert of alerts) {
        // Convert legacy alert format to new format
        const typedAlert: PriceAlert = {
          condition: alert.isAbove ? 'above' : 'below',
          price: alert.targetPrice,
          userId: alert.userId
        };

        if (
          (typedAlert.condition === 'above' && data.price >= typedAlert.price) ||
          (typedAlert.condition === 'below' && data.price <= typedAlert.price)
        ) {
          const callbacks = this.priceUpdateCallbacks.get(symbol) || [];
          callbacks.forEach(callback => callback(symbol, data.price));
          await redisService.removePriceAlert(typedAlert.userId, symbol, typedAlert.condition === 'above');
        }
      }
    } catch (error) {
      logError(error as Error, 'CryptoService.handlePriceUpdate');
    }
  }

  async getPrices(symbols: string[]): Promise<Record<string, PriceData>> {
    try {
      const ids = symbols.join(',');
      const response = await axios.get<Record<string, CoinGeckoPrice>>(`${this.API_BASE_URL}/simple/price`, {
        params: {
          ids,
          vs_currency: 'usd',
          include_24hr_vol: true,
          include_24hr_change: true,
          include_market_cap: true,
        },
      });

      const result: Record<string, PriceData> = {};
      for (const [id, data] of Object.entries(response.data)) {
        result[id] = {
          price: data.usd,
          change24h: data.usd_24h_change,
          volume24h: data.usd_24h_vol,
          marketCap: data.usd_market_cap,
        };
      }

      return result;
    } catch (error) {
      logError(error as Error, 'CryptoService.getPrices');
      throw error;
    }
  }

  async getPrice(symbol: string): Promise<PriceData | null> {
    try {
      // Try to get from cache first
      const cached = await redisService.getCache(`price:${symbol}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // If not in cache, fetch from API
      const prices = await this.getPrices([symbol]);
      return prices[symbol] || null;
    } catch (error) {
      logError(error as Error, 'CryptoService.getPrice');
      throw error;
    }
  }

  async get24HrChange(symbol: string): Promise<number | null> {
    try {
      const data = await this.getPrice(symbol);
      return data?.change24h || null;
    } catch (error) {
      logError(error as Error, 'CryptoService.get24HrChange');
      throw error;
    }
  }

  async getKlines(symbol: string, interval: string = '1d', limit: number = 30): Promise<MarketChartPoint[]> {
    try {
      const response = await axios.get<{ prices: [number, number][] }>(`${this.API_BASE_URL}/coins/${symbol}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: limit,
          interval,
        },
      });

      return response.data.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
      }));
    } catch (error) {
      logError(error as Error, 'CryptoService.getKlines');
      throw error;
    }
  }

  async getTopGainers(limit: number = 10): Promise<Array<{
    symbol: string;
    name: string;
    price: number;
    change24h: number;
  }>> {
    try {
      const response = await axios.get<CoinMarketData[]>(`${this.API_BASE_URL}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'price_change_percentage_24h_desc',
          per_page: limit,
          page: 1,
          sparkline: false,
        },
      });

      return response.data.map((coin) => ({
        symbol: coin.id,
        name: coin.name,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
      }));
    } catch (error) {
      logError(error as Error, 'CryptoService.getTopGainers');
      throw error;
    }
  }

  onPriceUpdate(symbol: string, callback: PriceUpdateCallback): void {
    const callbacks = this.priceUpdateCallbacks.get(symbol) || [];
    callbacks.push(callback);
    this.priceUpdateCallbacks.set(symbol, callbacks);
    
    // Start monitoring this symbol if not already
    if (!this.monitoredSymbols.has(symbol)) {
      this.monitoredSymbols.add(symbol);
      if (this.updateInterval) {
        // If monitoring is already running, fetch initial price
        this.getPrices([symbol]).catch(error => 
          logError(error as Error, 'CryptoService.onPriceUpdate')
        );
      }
    }
  }

  stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.monitoredSymbols.clear();
    this.priceUpdateCallbacks.clear();
    log.info('Price monitoring service stopped');
  }
}

export const cryptoService = new CryptoService(); 