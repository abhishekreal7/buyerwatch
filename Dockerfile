FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

RUN npm run build:worker

# Railway provides environment variables natively, so we don't need dotenv
# Run the compiled worker
CMD ["node", "dist/worker/index.js"]
