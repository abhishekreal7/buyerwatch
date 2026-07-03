FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Railway provides environment variables natively, so we don't need dotenv
# We run the worker using tsx
CMD ["npx", "tsx", "worker/index.ts"]
