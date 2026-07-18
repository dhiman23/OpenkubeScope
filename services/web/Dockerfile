#stage 1: build the app
FROM dhi.io/node:26-alpine-sfw-ent-dev AS builder


RUN apk update && apk upgrade --no-cache

WORKDIR /repo


COPY /services/web/package*.json ./services/web/

WORKDIR /repo/services/web

ENV DHI_NO_SFW=true

RUN npm ci

COPY services/web/. .

RUN npm run build \
    && npm prune --production

# stage 2: run the app

FROM dhi.io/node:26-alpine-sfw-ent-dev AS runtime

RUN addgroup -g 10001 -S appgroup && \
  adduser -u 10001 -S appuser -G appgroup 



ENV NODE_ENV=production
WORKDIR /app




COPY --from=builder /repo/services/web/.next ./.next
COPY --from=builder /repo/services/web/node_modules ./node_modules
COPY --from=builder /repo/services/web/package.json ./
COPY --from=builder /repo/services/web/public ./public
COPY --from=builder /repo/services/web/next.config.mjs ./


RUN chown -R appuser:appgroup /app

USER appuser


EXPOSE 3000

CMD ["node_modules/.bin/next", "start"]
