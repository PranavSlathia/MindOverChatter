FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
RUN npm install -g @anthropic-ai/claude-code@2.1.74
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["pnpm", "dev"]
