# Production image for the Karma frontend (React/Vite client + Express static server).
#
# VITE_API_BASE_URL is baked into the client bundle at build time, so the dev and
# prod images are built pointing at api-dev / api-prod respectively.
FROM node:20-alpine AS build
WORKDIR /app

# Full dependency set — the build needs Vite/esbuild/Tailwind (devDependencies).
COPY package*.json ./
RUN npm ci

COPY . .

# Which backend the SPA talks to (read by client/src/lib/config.ts).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Produces dist/public (client) and dist/index.js (bundled Express server).
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# node_modules is kept whole: the bundled server statically imports `vite`
# (only used on the dev code path, but evaluated at module load), so it must
# resolve at runtime even though serveStatic() is what actually runs in prod.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 5000
CMD ["node", "dist/index.js"]
