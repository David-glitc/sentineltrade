import OpenAI from 'openai';
import { config } from '../config/config';
import { log, logError } from '../utils/logger';
import { redisService } from './redis.service';

class AIService {
  private openai: OpenAI;
  private readonly CACHE_TTL = 1800; // 30 minutes cache

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.apis.openai.apiKey,
    });
  }

  private getCacheKey(type: string, params: Record<string, any>): string {
    return `ai:${type}:${JSON.stringify(params)}`;
  }

  async generateMarketAnalysis(
    symbol: string,
    priceData: any,
    newsData: any
  ): Promise<string> {
    try {
      const cacheKey = this.getCacheKey('market_analysis', {
        symbol,
        timestamp: Math.floor(Date.now() / (15 * 60 * 1000)), // 15-minute intervals
      });

      // Check cache
      const cachedAnalysis = await redisService.getCache(cacheKey);
      if (cachedAnalysis) {
        return cachedAnalysis;
      }

      const prompt = `Analyze the following market data for ${symbol}:
        
Price Data:
${JSON.stringify(priceData, null, 2)}

Recent News:
${JSON.stringify(newsData, null, 2)}

Provide a comprehensive market analysis including:
1. Price trend analysis
2. Key support and resistance levels
3. Market sentiment based on news
4. Potential risks and opportunities
5. Short-term price outlook`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional cryptocurrency analyst specializing in technical and fundamental analysis.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const analysis = response.choices[0].message.content || 'No analysis generated';

      // Cache the result
      await redisService.setCacheWithExpiry(cacheKey, analysis, this.CACHE_TTL);

      return analysis;
    } catch (error) {
      logError(error as Error, 'AIService.generateMarketAnalysis');
      throw error;
    }
  }

  async detectAnomalies(
    symbol: string,
    recentTrades: any[],
    historicalData: any
  ): Promise<{
    hasAnomaly: boolean;
    description: string;
    confidence: number;
  }> {
    try {
      const cacheKey = this.getCacheKey('anomaly_detection', {
        symbol,
        timestamp: Math.floor(Date.now() / (5 * 60 * 1000)), // 5-minute intervals
      });

      // Check cache
      const cachedResult = await redisService.getCache(cacheKey);
      if (cachedResult) {
        return JSON.parse(cachedResult);
      }

      const prompt = `Analyze the following trading data for ${symbol} and detect any anomalies:
        
Recent Trades:
${JSON.stringify(recentTrades, null, 2)}

Historical Data:
${JSON.stringify(historicalData, null, 2)}

Identify any unusual patterns, sudden price movements, or trading volumes that might indicate market manipulation or significant events.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an AI specializing in detecting cryptocurrency market anomalies and patterns.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 500,
      });

      const analysis = response.choices[0].message.content || '';
      const result = {
        hasAnomaly: analysis.toLowerCase().includes('anomaly'),
        description: analysis,
        confidence: this.calculateConfidence(analysis),
      };

      // Cache the result
      await redisService.setCacheWithExpiry(
        cacheKey,
        JSON.stringify(result),
        this.CACHE_TTL
      );

      return result;
    } catch (error) {
      logError(error as Error, 'AIService.detectAnomalies');
      throw error;
    }
  }

  async generateTradingSignal(
    symbol: string,
    timeframe: string,
    technicalData: any
  ): Promise<{
    signal: 'buy' | 'sell' | 'hold';
    reasoning: string;
    confidence: number;
  }> {
    try {
      const cacheKey = this.getCacheKey('trading_signal', {
        symbol,
        timeframe,
        timestamp: Math.floor(Date.now() / (15 * 60 * 1000)), // 15-minute intervals
      });

      // Check cache
      const cachedSignal = await redisService.getCache(cacheKey);
      if (cachedSignal) {
        return JSON.parse(cachedSignal);
      }

      const prompt = `Generate a trading signal for ${symbol} on ${timeframe} timeframe based on the following technical data:
        
${JSON.stringify(technicalData, null, 2)}

Provide a clear signal (buy/sell/hold) with detailed reasoning and confidence level.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an AI trading analyst specializing in cryptocurrency technical analysis.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
        max_tokens: 500,
      });

      const analysis = response.choices[0].message.content || '';
      const signal = this.parseSignal(analysis);

      // Cache the result
      await redisService.setCacheWithExpiry(
        cacheKey,
        JSON.stringify(signal),
        this.CACHE_TTL
      );

      return signal;
    } catch (error) {
      logError(error as Error, 'AIService.generateTradingSignal');
      throw error;
    }
  }

  private calculateConfidence(analysis: string): number {
    // Simple confidence calculation based on keyword presence
    const confidenceKeywords = [
      'certainly',
      'definitely',
      'clearly',
      'strong',
      'significant',
    ];
    const uncertaintyKeywords = [
      'possibly',
      'might',
      'could',
      'uncertain',
      'unclear',
    ];

    const confidenceCount = confidenceKeywords.filter((word) =>
      analysis.toLowerCase().includes(word)
    ).length;
    const uncertaintyCount = uncertaintyKeywords.filter((word) =>
      analysis.toLowerCase().includes(word)
    ).length;

    // Calculate confidence score (0.3 to 0.9 range)
    return Math.min(
      0.9,
      Math.max(0.3, 0.6 + (confidenceCount * 0.1 - uncertaintyCount * 0.1))
    );
  }

  private parseSignal(analysis: string): {
    signal: 'buy' | 'sell' | 'hold';
    reasoning: string;
    confidence: number;
  } {
    const lowerAnalysis = analysis.toLowerCase();
    let signal: 'buy' | 'sell' | 'hold' = 'hold';

    if (lowerAnalysis.includes('buy signal') || lowerAnalysis.includes('bullish')) {
      signal = 'buy';
    } else if (
      lowerAnalysis.includes('sell signal') ||
      lowerAnalysis.includes('bearish')
    ) {
      signal = 'sell';
    }

    return {
      signal,
      reasoning: analysis,
      confidence: this.calculateConfidence(analysis),
    };
  }
}

export const aiService = new AIService(); 