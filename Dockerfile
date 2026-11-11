# Build the static site, then serve it with nginx (works on Coolify as-is).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Optional self-hosted statistics (Umami); empty = no script.
ARG NEXT_PUBLIC_ANALYTICS_SRC=""
ARG NEXT_PUBLIC_ANALYTICS_ID=""
ENV NEXT_PUBLIC_ANALYTICS_SRC=$NEXT_PUBLIC_ANALYTICS_SRC NEXT_PUBLIC_ANALYTICS_ID=$NEXT_PUBLIC_ANALYTICS_ID
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
COPY public/404.html /usr/share/nginx/html/404.html
EXPOSE 80
