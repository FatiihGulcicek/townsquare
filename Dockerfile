# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# the server only needs these two packages at runtime
RUN npm init -y >/dev/null && npm install --no-audit --no-fund ws@^7.4.6 prom-client@^13.0.0 && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:${PORT}/healthz || exit 1
CMD ["node", "server/index.js"]
