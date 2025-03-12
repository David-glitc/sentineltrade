FROM node:20-alpine

WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Clean up dev dependencies
RUN npm prune --production

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"] 