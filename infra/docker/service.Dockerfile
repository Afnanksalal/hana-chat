ARG NODE_VERSION=20.19.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter "./packages/**" build
RUN pnpm --filter "./services/**" build
RUN find packages services -name node_modules -type d -prune -exec rm -rf {} +

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/services ./services
RUN pnpm install --prod --frozen-lockfile

ARG SERVICE_PATH=services/api-gateway
ENV SERVICE_PATH=${SERVICE_PATH}

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 CMD node -e "const port=process.env.HEALTH_PORT || process.env.API_GATEWAY_PORT || 4000; fetch('http://127.0.0.1:'+port+'/health').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node \"$SERVICE_PATH/dist/main.js\""]
