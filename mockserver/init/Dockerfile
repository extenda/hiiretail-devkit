FROM node:22-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production
COPY load-expectations.js ./
# Create expectations dir (custom expectations are optional)
RUN mkdir -p ./expectations
CMD ["node", "load-expectations.js"]
