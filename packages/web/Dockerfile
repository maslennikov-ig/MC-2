# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# Copy workspace configuration and all package.json files for monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-logger/package.json ./packages/shared-logger/
COPY packages/course-gen-platform/package.json ./packages/course-gen-platform/
COPY packages/trpc-client-sdk/package.json ./packages/trpc-client-sdk/
COPY packages/web/package.json ./packages/web/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# Copy all node_modules from deps stage (includes workspace packages)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/shared-logger/node_modules ./packages/shared-logger/node_modules
COPY --from=deps /app/packages/course-gen-platform/node_modules ./packages/course-gen-platform/node_modules
COPY --from=deps /app/packages/trpc-client-sdk/node_modules ./packages/trpc-client-sdk/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy source code, excluding test files and directories
COPY . .
# Remove test files that might have been copied
RUN rm -rf tests __tests__ scripts/test-* **/*.test.* **/*.spec.*

# Clean any existing build artifacts before building
# This prevents cache issues with long module paths (Radix UI, etc.)
# Also clean workspace package dist directories to ensure fresh builds
RUN rm -rf packages/web/.next node_modules/.cache tsconfig.tsbuildinfo
RUN rm -rf packages/shared-types/dist packages/shared-types/tsconfig.tsbuildinfo
RUN rm -rf packages/shared-logger/dist packages/shared-logger/tsconfig.tsbuildinfo
RUN rm -rf packages/course-gen-platform/dist packages/course-gen-platform/tsconfig.tsbuildinfo
RUN rm -rf packages/trpc-client-sdk/dist packages/trpc-client-sdk/tsconfig.tsbuildinfo

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
# Increase Node.js heap size for build to prevent OOM errors (2GB limit to avoid server freeze)
ENV NODE_OPTIONS="--max-old-space-size=2048"
# Build-time variables - passed from docker-compose
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG SUPABASE_JWT_SECRET
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
# Build shared packages first (other packages depend on them)
RUN pnpm --filter @megacampus/shared-types build
RUN pnpm --filter @megacampus/shared-logger build
# Build all remaining packages
RUN pnpm build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime environment variables - CRITICAL!
# These will be overridden by docker-compose env_file but we need defaults
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG SUPABASE_JWT_SECRET
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}

# Create nodejs user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from the web package (monorepo structure)
# Public folder must be relative to server.js location (packages/web/)
COPY --from=builder /app/packages/web/public ./packages/web/public

# Automatically leverage output traces to reduce image size
# Next.js standalone output is in packages/web/.next for monorepo
# Standalone contains: packages/web/server.js, packages/web/.next/, node_modules/
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
# Static files must be in packages/web/.next/static (relative to server.js location)
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/static ./packages/web/.next/static

# Switch to nodejs user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application (in monorepo, server.js is in packages/web/)
CMD ["node", "packages/web/server.js"]