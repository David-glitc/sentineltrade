import axios from 'axios';
import { config } from '../config/config';
import { log, logError } from '../utils/logger';
import { redisService } from './redis.service';

interface DuneExecutionResponse {
  execution_id: string;
  state: string;
}

class DuneService {
  private readonly API_BASE_URL = 'https://api.dune.com/api/v1';
  private readonly CACHE_TTL = 3600; // 1 hour cache

  private async makeRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any): Promise<T> {
    try {
      const response = await axios({
        method,
        url: `${this.API_BASE_URL}${endpoint}`,
        headers: {
          'x-dune-api-key': config.apis.dune.apiKey,
        },
        data,
      });
      return response.data;
    } catch (error) {
      logError(error as Error, 'DuneService.makeRequest');
      throw error;
    }
  }

  private getCacheKey(queryId: number, params?: Record<string, any>): string {
    return `dune:${queryId}:${params ? JSON.stringify(params) : 'default'}`;
  }

  async executeQuery(
    queryId: number,
    params?: Record<string, any>,
    forceFresh: boolean = false
  ): Promise<any> {
    try {
      const cacheKey = this.getCacheKey(queryId, params);

      // Try to get from cache if not forcing fresh data
      if (!forceFresh) {
        const cachedResult = await redisService.getCache(cacheKey);
        if (cachedResult) {
          log.debug(`Cache hit for Dune query ${queryId}`);
          return JSON.parse(cachedResult);
        }
      }

      // Execute query
      log.info(`Executing Dune query ${queryId}`);
      
      // First, execute the query
      const execution = await this.makeRequest<DuneExecutionResponse>('/query/execute', 'POST', {
        query_id: queryId,
        parameters: params,
      });

      // Wait for results
      const results = await this.makeRequest(`/execution/${execution.execution_id}`);

      // Cache the result
      await redisService.setCacheWithExpiry(
        cacheKey,
        JSON.stringify(results),
        this.CACHE_TTL
      );

      return results;
    } catch (error) {
      logError(error as Error, 'DuneService.executeQuery');
      throw error;
    }
  }

  // Predefined queries for common Polkadot metrics
  async getPolkadotStakingMetrics(): Promise<any> {
    // Query ID for Polkadot staking metrics
    const STAKING_QUERY_ID = 1234; // Replace with actual query ID
    return this.executeQuery(STAKING_QUERY_ID);
  }

  async getPolkadotTransferVolume(days: number = 7): Promise<any> {
    // Query ID for Polkadot transfer volume
    const VOLUME_QUERY_ID = 5678; // Replace with actual query ID
    return this.executeQuery(VOLUME_QUERY_ID, { days });
  }

  async getParachainMetrics(): Promise<any> {
    // Query ID for parachain metrics
    const PARACHAIN_QUERY_ID = 9012; // Replace with actual query ID
    return this.executeQuery(PARACHAIN_QUERY_ID);
  }

  async getWhaleTransactions(
    minAmount: number = 10000,
    days: number = 1
  ): Promise<any> {
    // Query ID for whale transactions
    const WHALE_QUERY_ID = 3456; // Replace with actual query ID
    return this.executeQuery(WHALE_QUERY_ID, { minAmount, days });
  }

  async getDailyActiveAccounts(): Promise<any> {
    // Query ID for daily active accounts
    const ACTIVE_ACCOUNTS_QUERY_ID = 7890; // Replace with actual query ID
    return this.executeQuery(ACTIVE_ACCOUNTS_QUERY_ID);
  }

  // Custom query execution with parameter validation
  async executeCustomQuery(
    queryId: number,
    params?: Record<string, any>
  ): Promise<any> {
    if (!queryId) {
      throw new Error('Query ID is required');
    }

    return this.executeQuery(queryId, params);
  }
}

export const duneService = new DuneService(); 