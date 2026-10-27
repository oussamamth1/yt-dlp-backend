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
# yt-dlp_linux is the standalone PyInstaller build, so it needs no system Python.
# you-get is pure Python, so python3/pip are installed for it alone.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ffmpeg ca-certificates python3 python3-pip && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    pip3 install --no-cache-dir --break-system-packages you-get && \
    apt-get purge -y curl python3-pip && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY certs ./certs

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
