# SentinelTrade

A highly advanced and extensible Telegram bot that provides real-time cryptocurrency intelligence with a strong focus on the Polkadot ecosystem. The bot integrates with Dune Analytics, cryptocurrency price APIs, trading indexes, and news aggregators to deliver market insights, on-chain data, and intelligent alerts to users.

## Features

- **Real-Time Crypto Data Fetching**
  - Live crypto prices, trading indexes, and charts
  - Dune Analytics API integration
  - Crypto news and sentiment analysis

- **Smart Price Alerts & Notifications**
  - Customizable price alerts
  - Redis-based notification system
  - Webhook support for external notifications

- **AI-Powered Voice Commands**
  - Voice message command support
  - Speech-to-text processing

- **Webhook & API Integration**
  - Real-time event-based alerts
  - DEX, CEX, and DeFi protocol integrations

- **Customizable Portfolio Tracking**
  - Personal asset tracking
  - Market trend analysis

- **AI-Driven Market Insights**
  - Trading signals and risk analysis
  - Whale movement detection
  - Price anomaly detection

## Prerequisites

- Node.js 20.x or higher
- Redis
- Docker and Docker Compose (for containerized deployment)
- Telegram Bot Token
- Various API keys (Dune Analytics, OpenAI, etc.)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/sentineltrade.git
   cd sentineltrade
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a .env file with required environment variables:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   DUNE_API_KEY=your_dune_api_key
   OPENAI_API_KEY=your_openai_api_key
   REDIS_URL=redis://localhost:6379
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Using Docker
```bash
# Build and start containers
docker-compose up --build

# Stop containers
docker-compose down
```

## Configuration

The bot can be configured through environment variables and the `config` directory. See the Configuration section in the documentation for more details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Polkadot Network
- Telegram Bot API
- Dune Analytics
- OpenAI
