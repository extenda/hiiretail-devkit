FROM node:22-alpine
WORKDIR /app
COPY webhook-receiver/package.json webhook-receiver/package-lock.json* ./
RUN npm ci --production
COPY webhook-receiver/server.js ./
EXPOSE 3002
CMD ["node", "server.js"]
