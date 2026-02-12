FROM node:22-alpine
WORKDIR /app
COPY validation-proxy/package.json validation-proxy/package-lock.json* ./
RUN npm ci --production || npm install --production
COPY validation-proxy/server.js ./
EXPOSE 1080
CMD ["node", "server.js"]
