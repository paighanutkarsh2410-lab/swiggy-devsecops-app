FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html ./
COPY vite.config.js ./
COPY eslint.config.js ./
COPY src ./src
COPY public ./public

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine

# Pick up Alpine security patches released after the base image was built.
USER root
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
