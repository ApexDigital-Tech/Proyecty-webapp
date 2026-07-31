FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and lock file
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the frontend and backend bundle
RUN npm run build

# Remove development dependencies to keep image size small
RUN npm prune --production

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Set node env to production
ENV NODE_ENV=production

# Copy only the built artifacts and production dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose the standard port (Render/Railway dynamically assigns this via ENV PORT)
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
