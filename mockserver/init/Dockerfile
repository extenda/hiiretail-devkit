FROM node:22-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production
COPY load-expectations.js ./
COPY expectations/ ./expectations/
CMD ["node", "load-expectations.js"]
