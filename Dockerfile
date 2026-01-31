# NHS Clinical Assistant — prototype image. Not for clinical use.
# Build: docker build -t triag-rag .
# Run:   docker run -p 5000:5000 -e DATABASE_URL=... -e OPENAI_API_KEY=... triag-rag

FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
