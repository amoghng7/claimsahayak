# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine AS serve

# Node runtime for the sidecar (server/) — Vertex AI proxy via ADC, no API key
RUN apk add --no-cache nodejs npm

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Sidecar service + its production deps
COPY server/package.json server/package-lock.json /app/server/
RUN cd /app/server && npm ci --omit=dev --ignore-scripts
COPY server/index.js /app/server/

# Startup: sidecar first (with a health wait), then the official nginx entrypoint
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Cloud Run uses PORT env var (default 8080)
EXPOSE 8080

CMD ["/start.sh"]
