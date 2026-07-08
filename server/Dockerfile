# Weather fronts backend.
# ffmpeg is included for the meteo.be video-frame extraction; the source
# falls back to mirroring the raw video when ffmpeg is missing.
FROM node:24-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY tools ./tools

ENV PORT=3311
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 3311

CMD ["npx", "tsx", "src/index.ts"]
