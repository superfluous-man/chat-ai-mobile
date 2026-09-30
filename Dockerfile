FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/chat.sqlite
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY public ./public
COPY src ./src
RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "start"]
