# Imagem única com o app web e o serviço de chamados (dois processos via `npm start`).
# Só a porta 3000 é exposta; o serviço de chamados fica interno ao contêiner.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Ferramentas de build caso o binário pré-compilado do better-sqlite3 não sirva.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent/package.json packages/agent/
COPY services/tickets/package.json services/tickets/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/app/data
COPY --from=build /app /app
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
