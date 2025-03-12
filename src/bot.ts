import { Bot, Context, session, SessionFlavor, Keyboard, InlineKeyboard } from 'grammy';
import { config } from './config/config';
import { log, logError } from './utils/logger';
import { cryptoService } from './services/crypto.service';
import { duneService } from './services/dune.service';
import { aiService } from './services/ai.service';
import { voiceService } from './services/voice.service';
import { webhookService } from './services/webhook.service';
import { redisService } from './services/redis.service';

interface SessionData {
  userId: number;
  portfolio: Record<string, number>;
  awaitingInput?: {
    command: string;
    step: string;
  };
}

type BotContext = Context & SessionFlavor<SessionData>;

class SentinelTradeBot {
  private bot: Bot<BotContext>;
  private readonly mainKeyboard: Keyboard;
  private readonly popularCoins = ['BTC', 'ETH', 'DOT', 'BNB', 'SOL'];

  constructor() {
    this.bot = new Bot<BotContext>(config.telegram.botToken);

    // Initialize main keyboard
    this.mainKeyboard = new Keyboard()
      .text("💰 Check Price").text("⚡ Set Alert").row()
      .text("📊 Portfolio").text("📈 Analysis").row()
      .text("⚙️ Settings").resized();

    // Initialize session with default in-memory storage
    this.bot.use(
      session({
        initial: (): SessionData => ({
          userId: 0,
          portfolio: {},
        })
      })
    );

    this.setupCommandHandlers();
    this.setupCallbackHandlers();
    this.setupVoiceHandler();
    this.setupErrorHandler();
  }

  private setupCommandHandlers(): void {
    // Start command
    this.bot.command('start', async (ctx: BotContext) => {
      try {
        await ctx.reply(
          'Welcome to SentinelTrade! 🚀\n\n' +
          'I can help you track cryptocurrency prices, set alerts, and provide market insights.\n\n' +
          'Use the menu below to get started:',
          { reply_markup: this.mainKeyboard }
        );
      } catch (error) {
        logError(error as Error, 'start command');
      }
    });

    // Handle text messages including keyboard buttons
    this.bot.on('message:text', async (ctx: BotContext) => {
      try {
        const text = ctx.message?.text;
        if (!text) return;

        // Handle main menu buttons
        switch (text) {
          case "💰 Check Price":
            await this.showPriceMenu(ctx);
            break;
          case "⚡ Set Alert":
            await this.showAlertMenu(ctx);
            break;
          case "📊 Portfolio":
            await this.handlePortfolioCommand(ctx);
            break;
          case "📈 Analysis":
            await this.showAnalysisMenu(ctx);
            break;
          case "⚙️ Settings":
            await this.showSettingsMenu(ctx);
            break;
          default:
            // Handle awaiting input states
            if (ctx.session.awaitingInput) {
              await this.handleAwaitingInput(ctx, text);
            }
        }
      } catch (error) {
        logError(error as Error, 'text message handler');
        await ctx.reply('An error occurred. Please try again.', {
          reply_markup: this.mainKeyboard
        });
      }
    });
  }

  private async showPriceMenu(ctx: BotContext): Promise<void> {
    const keyboard = new InlineKeyboard();
    
    // Add popular coins in a grid
    for (let i = 0; i < this.popularCoins.length; i += 2) {
      const buttons = this.popularCoins.slice(i, i + 2).map(coin => 
        ({ text: coin, callback_data: `price_${coin}` })
      );
      keyboard.row(...buttons);
    }
    
    keyboard.row({ text: "🔍 Other Coin", callback_data: "price_other" });

    await ctx.reply("Select a cryptocurrency to check its price:", {
      reply_markup: keyboard
    });
  }

  private async showAlertMenu(ctx: BotContext): Promise<void> {
    const keyboard = new InlineKeyboard();
    
    // Add popular coins in a grid
    for (let i = 0; i < this.popularCoins.length; i += 2) {
      const buttons = this.popularCoins.slice(i, i + 2).map(coin => 
        ({ text: coin, callback_data: `alert_${coin}` })
      );
      keyboard.row(...buttons);
    }
    
    keyboard.row({ text: "🔍 Other Coin", callback_data: "alert_other" });

    await ctx.reply("Select a cryptocurrency to set a price alert:", {
      reply_markup: keyboard
    });
  }

  private async showAnalysisMenu(ctx: BotContext): Promise<void> {
    const keyboard = new InlineKeyboard();
    
    // Add popular coins in a grid
    for (let i = 0; i < this.popularCoins.length; i += 2) {
      const buttons = this.popularCoins.slice(i, i + 2).map(coin => 
        ({ text: coin, callback_data: `analyze_${coin}` })
      );
      keyboard.row(...buttons);
    }
    
    keyboard.row({ text: "🔍 Other Coin", callback_data: "analyze_other" });

    await ctx.reply("Select a cryptocurrency for market analysis:", {
      reply_markup: keyboard
    });
  }

  private async showSettingsMenu(ctx: BotContext): Promise<void> {
    const keyboard = new InlineKeyboard()
      .text("🔔 Notification Settings", "settings_notifications").row()
      .text("🌐 Set Webhook", "settings_webhook").row()
      .text("❌ Clear All Alerts", "settings_clear_alerts");

    await ctx.reply("⚙️ Settings Menu:", {
      reply_markup: keyboard
    });
  }

  private setupCallbackHandlers(): void {
    this.bot.on('callback_query:data', async (ctx: BotContext) => {
      try {
        const data = ctx.callbackQuery?.data;
        if (!data) {
          await ctx.answerCallbackQuery('Invalid callback data');
          return;
        }
        
        if (data.startsWith('price_')) {
          const coin = data.replace('price_', '');
          if (coin === 'other') {
            ctx.session.awaitingInput = { command: 'price', step: 'coin' };
            await ctx.reply('Please enter the cryptocurrency symbol (e.g., DOT):', {
              reply_markup: { force_reply: true }
            });
          } else {
            await this.handlePriceCommand(ctx, coin);
          }
        } else if (data.startsWith('alert_')) {
          const coin = data.replace('alert_', '');
          if (coin === 'other') {
            ctx.session.awaitingInput = { command: 'alert', step: 'coin' };
            await ctx.reply('Please enter the cryptocurrency symbol (e.g., DOT):', {
              reply_markup: { force_reply: true }
            });
          } else {
            ctx.session.awaitingInput = { command: 'alert', step: 'price' };
            await ctx.reply(`Enter the target price for ${coin} alert:`, {
              reply_markup: { force_reply: true }
            });
          }
        } else if (data.startsWith('analyze_')) {
          const coin = data.replace('analyze_', '');
          if (coin === 'other') {
            ctx.session.awaitingInput = { command: 'analyze', step: 'coin' };
            await ctx.reply('Please enter the cryptocurrency symbol (e.g., DOT):', {
              reply_markup: { force_reply: true }
            });
          } else {
            await this.handleAnalysisCommand(ctx, coin);
          }
        } else if (data.startsWith('settings_')) {
          await this.handleSettingsCallback(ctx, data);
        }

        // Answer the callback query to remove loading state
        await ctx.answerCallbackQuery();
      } catch (error) {
        logError(error as Error, 'callback query handler');
        await ctx.answerCallbackQuery('An error occurred. Please try again.');
      }
    });
  }

  private async handleAwaitingInput(ctx: BotContext, text: string): Promise<void> {
    const { command, step } = ctx.session.awaitingInput!;

    switch (command) {
      case 'price':
        await this.handlePriceCommand(ctx, text);
        break;
      case 'alert':
        if (step === 'coin') {
          ctx.session.awaitingInput = { command: 'alert', step: 'price' };
          await ctx.reply(`Enter the target price for ${text} alert:`, {
            reply_markup: { force_reply: true }
          });
        } else if (step === 'price') {
          const price = parseFloat(text);
          if (isNaN(price)) {
            await ctx.reply('Invalid price. Please enter a valid number.');
            return;
          }
          // Handle alert setting
          await this.handleAlertCommand(ctx, { symbol: text, price: text });
        }
        break;
      case 'analyze':
        await this.handleAnalysisCommand(ctx, text);
        break;
    }

    // Clear awaiting input state
    ctx.session.awaitingInput = undefined;
  }

  private async handleSettingsCallback(ctx: BotContext, data: string): Promise<void> {
    switch (data) {
      case 'settings_notifications':
        const notifKeyboard = new InlineKeyboard()
          .text("🔊 Enable All", "notif_enable_all")
          .text("🔇 Disable All", "notif_disable_all").row()
          .text("⬅️ Back to Settings", "settings_main");

        await ctx.editMessageText("🔔 Notification Settings:", {
          reply_markup: notifKeyboard
        });
        break;

      case 'settings_webhook':
        ctx.session.awaitingInput = { command: 'webhook', step: 'url' };
        await ctx.reply('Please enter your webhook URL:', {
          reply_markup: { force_reply: true }
        });
        break;

      case 'settings_clear_alerts':
        // Add confirmation keyboard
        const confirmKeyboard = new InlineKeyboard()
          .text("✅ Yes, clear all", "clear_alerts_confirm")
          .text("❌ No, keep alerts", "settings_main");

        await ctx.editMessageText("Are you sure you want to clear all alerts?", {
          reply_markup: confirmKeyboard
        });
        break;
    }
  }

  private setupVoiceHandler(): void {
    this.bot.on('message:voice', async (ctx: BotContext) => {
      try {
        await ctx.reply('Processing voice command...');

        if (!ctx.message?.voice) {
          throw new Error('No voice message found');
        }

        const file = await ctx.api.getFile(ctx.message.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        const buffer = await fetch(fileUrl).then(res => res.arrayBuffer()).then(buf => Buffer.from(buf));

        const transcription = await voiceService.transcribeAudio(buffer);
        const command = await voiceService.detectCommand(transcription);

        await ctx.reply(`Detected command: ${command.command}\nExecuting...`);

        // Execute the detected command
        switch (command.command) {
          case 'price':
            await this.handlePriceCommand(ctx, command.params.symbol);
            break;
          case 'alert':
            await this.handleAlertCommand(ctx, command.params);
            break;
          case 'portfolio':
            await this.handlePortfolioCommand(ctx);
            break;
          case 'analysis':
            await this.handleAnalysisCommand(ctx, command.params.symbol);
            break;
          default:
            await ctx.reply('Command not recognized. Please try again.');
        }
      } catch (error) {
        logError(error as Error, 'voice message handler');
        await ctx.reply('Error processing voice command. Please try again.');
      }
    });
  }

  private setupErrorHandler(): void {
    this.bot.catch((err: Error) => {
      logError(err, 'bot error handler');
    });
  }

  private async handlePriceCommand(ctx: BotContext, symbol: string): Promise<void> {
    await ctx.reply(`Getting price for ${symbol}...`);
    const priceData = await cryptoService.getPrice(symbol);
    if (!priceData) {
      await ctx.reply(`Could not fetch price for ${symbol}`);
      return;
    }

    await ctx.reply(
      `💰 ${symbol} Price:\n` +
        `Current: $${priceData.price.toFixed(4)}\n` +
        `24h Change: ${priceData.change24h.toFixed(2)}%\n` +
        `24h Volume: $${priceData.volume24h.toFixed(2)}`
    );
  }

  private async handleAlertCommand(
    ctx: BotContext,
    params: Record<string, string>
  ): Promise<void> {
    const { symbol, price } = params;
    if (!ctx.from?.id) {
      await ctx.reply('Could not identify user');
      return;
    }

    await ctx.reply(`Setting alert for ${symbol} at $${price}...`);
    await redisService.setPriceAlert(
      ctx.from.id,
      symbol,
      parseFloat(price),
      true
    );
    await ctx.reply('Alert set successfully!');
  }

  private async handlePortfolioCommand(ctx: BotContext): Promise<void> {
    if (!ctx.from?.id) {
      await ctx.reply('Could not identify user');
      return;
    }

    await ctx.reply('Fetching portfolio...');
    const portfolio = await redisService.getUserPortfolio(ctx.from.id);
    if (Object.keys(portfolio).length === 0) {
      await ctx.reply(
        'Your portfolio is empty. Add assets using /add <symbol> <amount>'
      );
      return;
    }

    let totalValue = 0;
    let message = '📊 Your Portfolio:\n\n';

    for (const [symbol, amount] of Object.entries(portfolio)) {
      const priceData = await cryptoService.getPrice(symbol);
      if (priceData) {
        const value = amount * priceData.price;
        totalValue += value;
        message += `${symbol}: ${amount} (≈ $${value.toFixed(2)})\n`;
      }
    }

    message += `\nTotal Value: $${totalValue.toFixed(2)}`;
    await ctx.reply(message);
  }

  private async handleAnalysisCommand(
    ctx: BotContext,
    symbol: string
  ): Promise<void> {
    await ctx.reply(`Generating analysis for ${symbol}...`);
    const [priceData, technicalData] = await Promise.all([
      cryptoService.getKlines(symbol, '1d', 30),
      duneService.getPolkadotStakingMetrics(),
    ]);

    const analysis = await aiService.generateMarketAnalysis(
      symbol,
      priceData,
      technicalData
    );

    await ctx.reply(`📈 Market Analysis for ${symbol}:\n\n${analysis}`);
  }

  async start(): Promise<void> {
    try {
      await this.bot.start();
      log.info('Bot started successfully');
    } catch (error) {
      logError(error as Error, 'bot startup');
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.bot.stop();
      log.info('Bot stopped successfully');
    } catch (error) {
      logError(error as Error, 'bot shutdown');
      throw error;
    }
  }
}

export const bot = new SentinelTradeBot(); 