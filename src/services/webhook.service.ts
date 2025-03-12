import axios from 'axios';
import { log, logError } from '../utils/logger';
import { redisService } from './redis.service';

class WebhookService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  async sendNotification(
    userId: number,
    event: string,
    data: Record<string, any>
  ): Promise<boolean> {
    try {
      const webhookUrl = await redisService.getWebhook(userId);
      if (!webhookUrl) {
        log.debug(`No webhook URL found for user ${userId}`);
        return false;
      }

      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      };

      return await this.sendWithRetry(webhookUrl, payload);
    } catch (error) {
      logError(error as Error, 'WebhookService.sendNotification');
      return false;
    }
  }

  private async sendWithRetry(
    url: string,
    payload: Record<string, any>,
    attempt: number = 1
  ): Promise<boolean> {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SentinelTrade-Bot/1.0',
        },
        timeout: 5000, // 5 seconds timeout
      });

      if (response.status >= 200 && response.status < 300) {
        log.debug(`Webhook notification sent successfully to ${url}`);
        return true;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (attempt < this.MAX_RETRIES) {
        log.warn(
          `Webhook delivery failed (attempt ${attempt}/${this.MAX_RETRIES}), retrying...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.RETRY_DELAY * attempt)
        );
        return this.sendWithRetry(url, payload, attempt + 1);
      }

      logError(error as Error, 'WebhookService.sendWithRetry');
      return false;
    }
  }

  async sendPriceAlert(
    userId: number,
    symbol: string,
    price: number,
    targetPrice: number,
    isAbove: boolean
  ): Promise<boolean> {
    return this.sendNotification(userId, 'price_alert', {
      symbol,
      currentPrice: price,
      targetPrice,
      condition: isAbove ? 'above' : 'below',
      message: `${symbol} price is now ${isAbove ? 'above' : 'below'} ${targetPrice} (Current: ${price})`,
    });
  }

  async sendWhaleAlert(
    userId: number,
    symbol: string,
    amount: number,
    txHash: string
  ): Promise<boolean> {
    return this.sendNotification(userId, 'whale_alert', {
      symbol,
      amount,
      txHash,
      message: `Whale movement detected: ${amount} ${symbol}`,
    });
  }

  async sendMarketAlert(
    userId: number,
    symbol: string,
    type: 'volatility' | 'trend_change' | 'volume_spike',
    data: Record<string, any>
  ): Promise<boolean> {
    return this.sendNotification(userId, 'market_alert', {
      symbol,
      type,
      ...data,
    });
  }

  async sendAnomalyAlert(
    userId: number,
    symbol: string,
    anomaly: {
      type: string;
      description: string;
      confidence: number;
    }
  ): Promise<boolean> {
    return this.sendNotification(userId, 'anomaly_alert', {
      symbol,
      ...anomaly,
    });
  }

  async testWebhook(url: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const testPayload = {
        event: 'test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test notification from SentinelTrade',
        },
      };

      const success = await this.sendWithRetry(url, testPayload);
      return {
        success,
        message: success
          ? 'Webhook test successful'
          : 'Failed to deliver test webhook',
      };
    } catch (error) {
      logError(error as Error, 'WebhookService.testWebhook');
      return {
        success: false,
        message: `Webhook test failed: ${(error as Error).message}`,
      };
    }
  }
}

export const webhookService = new WebhookService(); 