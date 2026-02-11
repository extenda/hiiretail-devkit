FROM node:22-alpine
WORKDIR /app
COPY webhook-playground/package.json webhook-playground/package-lock.json* ./
RUN npm ci --production || npm install --production
COPY webhook-playground/server.js ./
COPY webhook-playground/public/ ./public/
COPY webhooks/events/ /events/
ENV EVENTS_DIR=/events
EXPOSE 8081
CMD ["node", "server.js"]
