FROM node:22-alpine
WORKDIR /app
COPY ccc-server/package.json ccc-server/package-lock.json* ./
RUN npm ci --production || npm install --production
COPY ccc-server/server.js ./
EXPOSE 3003
CMD ["node", "server.js"]
