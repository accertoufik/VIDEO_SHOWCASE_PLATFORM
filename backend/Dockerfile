# One image for both the API and the video worker. The command decides which one runs:
#   API:    bun run start    (the default below)
#   worker: bun run worker
FROM oven/bun:1-debian

WORKDIR /app

# Dependencies first, so this layer is reused until package.json / bun.lock change.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Prisma builds its client at install time; it only needs *a* URL to read the config, not a real database.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" bunx prisma generate --config prisma7.config.ts

ENV NODE_ENV=production
EXPOSE 3000

# FFmpeg and ffprobe come bundled through npm (ffmpeg-static / ffprobe-static): nothing to apt-get.
CMD ["bun", "run", "start"]
