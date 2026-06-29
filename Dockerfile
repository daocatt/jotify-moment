# Stage 1: Install dependencies and build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Run application
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Install production dependencies only if standalone mode is not fully configured,
# but Next.js Standalone already bundles node_modules! Just to be sure, we copy standard standalone output.

# Ensure uploads directory has correct write permissions
RUN mkdir -p public/uploads && chmod 777 public/uploads

EXPOSE 3000

# Standalone Next.js outputs server.js
CMD ["node", "server.js"]
