# Separate from the static marketing image. Requires a writable data volume
# and LINES_CREATIVE_CREDENTIALS_FILE mounted at runtime. No provider keys.
FROM node:22-alpine
RUN apk add --no-cache ffmpeg font-noto-arabic font-dejavu \
  && mkdir -p /data \
  && chown node:node /data
WORKDIR /srv
COPY package.json ./
COPY src ./src
USER node
ENV NODE_ENV=production \
  LINES_CREATIVE_HOST=0.0.0.0 \
  LINES_CREATIVE_PORT=8080 \
  LINES_CREATIVE_DATA_DIR=/data \
  LINES_CREATIVE_PROVIDER=local-ffmpeg
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8080/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
