# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY prisma ./prisma/
RUN npm install

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/

# Bust cache on every deploy
ARG CACHEBUST=1
RUN npx prisma generate && npx nest build

# Verify dist was created
RUN ls -la dist/ && test -f dist/main.js

# ---- Production ----
FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# Copy prisma schema + generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Copy built app
COPY --from=builder /app/dist ./dist

# Verify dist exists in final image
RUN ls -la dist/

EXPOSE 3001

CMD ["node", "dist/main"]
