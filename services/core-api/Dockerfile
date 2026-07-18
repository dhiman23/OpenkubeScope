FROM  dhi.io/node:26-alpine-sfw-ent-dev AS builder

RUN apk add --no-cache protobuf bash

RUN apk update && apk upgrade --no-cache

WORKDIR /web

COPY proto ./proto

COPY  /services/core-api/package*.json ./services/core-api/

WORKDIR /web/services/core-api

ENV DHI_NO_SFW=true

RUN npm ci

COPY /services/core-api/. .

RUN npm run build \
    && npm prune --production

FROM dhi.io/node:26-alpine-sfw-ent-dev AS runtime

RUN addgroup -g 10001 -S appgroup && \
  adduser -u 10001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /web/services/core-api/dist ./dist
COPY --from=builder /web/services/core-api/migrations ./migrations
COPY --from=builder /web/services/core-api/node_modules ./node_modules
COPY --from=builder /web/services/core-api/package.json ./

RUN chown -R appuser:appgroup /app

USER appuser



EXPOSE 8080

CMD ["node","dist/server.js"]

