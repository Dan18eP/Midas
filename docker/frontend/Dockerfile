# Multi-stage Dockerfile for Midas Frontend (Next.js 14)
# Historia de Usuario: HU-FRONT-07 & ADR-010

FROM node:20-alpine AS deps
WORKDIR /app
COPY src/frontend/package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src/frontend ./
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_SSE_URL=http://localhost:8000/api/v1/telemetry/stream
ARG NEXT_PUBLIC_MOCK_SSE=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SSE_URL=$NEXT_PUBLIC_SSE_URL
ENV NEXT_PUBLIC_MOCK_SSE=$NEXT_PUBLIC_MOCK_SSE
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
