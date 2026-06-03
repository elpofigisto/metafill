# metafill — containerised local tool.
#
# Note this is NOT a plain Node image: metafill shells out to Fastlane's
# `deliver` (Ruby) to fetch/upload App Store Connect metadata, so the image
# carries Node + Ruby + Fastlane. It also runs the CLI steps via `tsx` against
# the TypeScript source at runtime, so the source ships in the image (we don't
# prune to just the .next build).

FROM node:22-bookworm-slim

# Ruby + Fastlane for the App Store Connect fetch/upload steps. build-essential
# and the -dev libs are needed to compile Fastlane's native gem dependencies.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ruby-full build-essential libffi-dev libssl-dev zlib1g-dev git \
  && gem install fastlane --no-document \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install JS deps first for better layer caching. Dev deps are included so the
# production build can typecheck; `next` and `tsx` are themselves runtime deps.
COPY package.json package-lock.json ./
RUN npm ci

# App source. Secrets and local data (apps.config.json, *.p8, .env, metadata,
# logs) are excluded via .dockerignore and supplied at runtime via mounts/env.
COPY . .

# Production build.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
