FROM node:22-alpine AS builder
WORKDIR /app
COPY apps/web/package.json ./package.json
RUN npm install
COPY apps/web/ ./
RUN npm run build
FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
