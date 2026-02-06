FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production || npm install --production
COPY server.js ./
COPY public/ ./public/
EXPOSE 8081
CMD ["node", "server.js"]
