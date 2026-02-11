FROM node:22-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY mockserver/init/package.json mockserver/init/package-lock.json* ./
RUN npm ci --production
COPY mockserver/init/load-expectations.js ./
COPY specs/urls.json /specs/urls.json
# Create expectations dir (custom expectations are optional)
RUN mkdir -p ./expectations
CMD ["node", "load-expectations.js"]
