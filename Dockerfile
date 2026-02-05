# Build/runtime image for EduHub (multi-stage, pnpm-based, non-root runtime).
FROM node:20-alpine AS base

# Keep workdir consistent across stages.
WORKDIR /app

# Enable corepack so pnpm is available without a global install.
RUN corepack enable

FROM base AS deps

# Install dependencies once to maximize cache reuse.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build

# Reuse dependencies from deps stage to speed up builds.
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runtime

# Production runtime defaults.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install curl for container healthchecks.
RUN apk add --no-cache curl

# Create a non-root user for the runtime container.
RUN addgroup -S app && adduser -S app -G app

# Copy runtime assets and server bundle.
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/public ./public
COPY --from=build /app/messages ./messages
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules

USER app

EXPOSE 3000

# Start the Next.js server.
CMD ["pnpm", "start"]
