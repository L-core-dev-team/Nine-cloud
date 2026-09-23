FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile --registry https://registry.npmjs.org
RUN pnpm --filter @jiuxiao/contracts build && pnpm --filter @jiuxiao/api build
EXPOSE 8787
CMD ["node", "apps/api/dist/index.js"]
