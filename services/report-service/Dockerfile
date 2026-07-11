#stage 1: build the app
FROM dhi.io/node:26-alpine-sfw-ent-dev AS builder

# protoc is only needed to generate src/generated/scanner.ts at build time.
RUN apk add --no-cache protobuf 

RUN apk add --no-cache bash

RUN apk update && apk upgrade --no-cache

WORKDIR /repo

COPY proto ./proto

COPY /services/report-service/package*.json ./services/report-service/

WORKDIR /repo/services/report-service

ENV DHI_NO_SFW=true

RUN npm ci

COPY services/report-service/. .

RUN npm run build \
    && npm prune --production

# stage 2: run the app

FROM dhi.io/node:26-alpine-sfw-ent-dev AS runtime

RUN addgroup -g 10001 -S appgroup && \
  adduser -u 10001 -S appuser -G appgroup 



ENV NODE_ENV=production
WORKDIR /app




COPY --from=builder /repo/services/report-service/dist ./dist
COPY --from=builder /repo/services/report-service/node_modules ./node_modules
COPY --from=builder /repo/services/report-service/package.json ./


RUN chown -R appuser:appgroup /app

USER appuser


EXPOSE 50052

CMD ["node", "dist/server.js"]
