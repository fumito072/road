# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/

RUN npx prisma generate
RUN npx nest build

# ---- Production ----
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma/

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
