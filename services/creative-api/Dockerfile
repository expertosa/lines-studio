# Separate Coolify app from the static marketing site.
# Persistent volume: mount it on /data (SQLite, artifacts, temp renders).
# One replica. SQLite is not safe with two writers. worker.lock is an
# exclusive lock released on process death; a new container waits for handoff.
FROM node:22-alpine
# curl and wget are what Coolify runs inside the container
# (`curl -f URL || wget -q -O- URL || exit 1`). Without them the log is
# "curl: not found" and the probe does not see /v1/health.
RUN apk add --no-cache ffmpeg font-noto-arabic font-dejavu curl wget \
  && mkdir -p /data \
  && chown node:node /data
WORKDIR /srv
COPY package.json ./
COPY src ./src
USER node
ENV NODE_ENV=production \
  LINES_HOST=0.0.0.0 \
  LINES_PORT=8080 \
  LINES_DATA_DIR=/data \
  LINES_DEFAULT_ENGINE=moneyprinter \
  LINES_ENABLE_TEMPLATE=1 \
  LINES_TRUST_PROXY=1
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=10 \
  CMD curl -fsS --max-time 2 http://127.0.0.1:8080/v1/health
CMD ["node", "src/index.js"]
