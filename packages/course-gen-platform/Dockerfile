# syntax=docker/dockerfile:1.4

# Build arguments
ARG NODE_VERSION=20
ARG BUILD_DATE
ARG VCS_REF

# Stage 1: Base image with pnpm
FROM node:${NODE_VERSION}-alpine AS base

# Install pnpm globally
RUN corepack enable pnpm

# Set working directory
WORKDIR /app

# Install security updates and required tools
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Stage 2: Dependencies
FROM base AS deps

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files for workspace
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-logger/package.json ./packages/shared-logger/
COPY packages/course-gen-platform/package.json ./packages/course-gen-platform/

# Install all dependencies (including dev dependencies for build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Stage 3: Builder
FROM deps AS builder

# Copy root tsconfig.json (shared-types extends it)
COPY tsconfig.json ./

# Copy source code for shared-types
COPY packages/shared-types ./packages/shared-types

# Copy source code for shared-logger
COPY packages/shared-logger ./packages/shared-logger

# Clean any stale dist files that might have been copied from local dev
RUN rm -rf packages/shared-types/dist packages/shared-types/tsconfig.tsbuildinfo
RUN rm -rf packages/shared-logger/dist packages/shared-logger/tsconfig.tsbuildinfo

# Build shared packages first (shared-types, then shared-logger)
RUN pnpm --filter @megacampus/shared-types build
RUN pnpm --filter @megacampus/shared-logger build

# Copy source code for course-gen-platform
COPY packages/course-gen-platform ./packages/course-gen-platform

# Clean any stale dist files that might have been copied from local dev
RUN rm -rf packages/course-gen-platform/dist packages/course-gen-platform/tsconfig.tsbuildinfo

# Build course-gen-platform
RUN pnpm --filter @megacampus/course-gen-platform build

# Prune dev dependencies
RUN pnpm --filter @megacampus/course-gen-platform --prod deploy pruned

# Stage 4: Production image
FROM node:${NODE_VERSION}-alpine AS runner

# Metadata labels
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.authors="MegaCampus Team"
LABEL org.opencontainers.image.url="https://github.com/maslennikov-ig/MegaCampusAI"
LABEL org.opencontainers.image.source="https://github.com/maslennikov-ig/MegaCampusAI"
LABEL org.opencontainers.image.version="0.26.3"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.title="MegaCampus API Server"
LABEL org.opencontainers.image.description="Express + tRPC API server for MegaCampusAI platform"

# Install security updates and tsx for ESM module resolution
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/* && \
    npm install -g tsx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy production dependencies and built application
COPY --from=builder --chown=nodejs:nodejs /app/pruned/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages/course-gen-platform/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/course-gen-platform/package.json ./package.json
# Copy shared-types workspace package (not included in pruned)
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared-types/dist ./node_modules/@megacampus/shared-types/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared-types/package.json ./node_modules/@megacampus/shared-types/package.json
# Copy shared-logger workspace package (not included in pruned)
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared-logger/dist ./node_modules/@megacampus/shared-logger/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/shared-logger/package.json ./node_modules/@megacampus/shared-logger/package.json
# Copy production tsconfig for tsx path alias resolution
COPY --from=builder --chown=nodejs:nodejs /app/packages/course-gen-platform/tsconfig.production.json ./tsconfig.json

# Create uploads directory
RUN mkdir -p /app/uploads && chown nodejs:nodejs /app/uploads

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)}).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application using tsx for proper ESM module resolution
# Can be overridden for worker: ["tsx", "dist/orchestrator/worker-entrypoint.js"]
CMD ["tsx", "dist/server/index.js"]
