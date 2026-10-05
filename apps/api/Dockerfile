FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts/api-account-expiry.mjs scripts/api-retention.mjs scripts/verify-auth-mail.mjs scripts/api-production-smoke.mjs ./scripts/
RUN pnpm install --frozen-lockfile --registry https://registry.npmjs.org
RUN pnpm --filter @jiuxiao/contracts build && pnpm --filter @jiuxiao/content build && pnpm --filter @jiuxiao/domain build && pnpm --filter @jiuxiao/db build && pnpm --filter @jiuxiao/api build
ENV NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]
