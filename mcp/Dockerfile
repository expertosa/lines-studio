# Lines Studio MCP server. Build context is the repo root (it reads lib/ for designs and prices):
#   docker build -f mcp/Dockerfile -t lines-mcp .
FROM node:22-alpine
WORKDIR /app
COPY mcp/package*.json mcp/
RUN cd mcp && npm ci --omit=dev
COPY lib lib
COPY mcp/src mcp/src
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
WORKDIR /app/mcp
CMD ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "src/server.js"]
