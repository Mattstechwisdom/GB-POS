FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:railway

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY tools/start-web.cjs tools/write-runtime-config.cjs tools/client-update-api.cjs tools/gidget-api.cjs tools/product-source-api.cjs ./tools/

CMD ["npm", "run", "start:web"]
