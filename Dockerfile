# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- Production stage ----
FROM node:20-slim
WORKDIR /app

# ffmpeg is needed by yt-dlp to merge separate video/audio streams.
# yt-dlp_linux is the standalone PyInstaller build, so no system Python is required.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ffmpeg ca-certificates && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    apt-get purge -y curl && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
