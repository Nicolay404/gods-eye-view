# syntax=docker/dockerfile:1
# God's Eye View en Docker. Node 24 LTS (el proyecto exige >=24.14 <25 o 26.x)
FROM node:24-bookworm-slim AS base
WORKDIR /app
# Puppeteer solo se usa en scripts de QA: no descargar Chrome (~170 MB)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=4173
# Capa de dependencias cacheable: solo cambia si cambia el lockfile
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY --chown=node:node . .
RUN mkdir -p .gev-cache && chown -R node:node /app
USER node
EXPOSE 4173

# ---- dev: servidor Vite con hot reload (código montado como volumen) ----
FROM base AS dev
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]

# ---- prod: build + preview. El build se hace al ARRANCAR, no en la imagen,
# porque Vite incrusta GOOGLE_MAPS_API_KEY y CESIUM_ION_TOKEN en el bundle:
# así ninguna key queda guardada en las capas de la imagen.
FROM base AS prod
CMD ["sh", "-c", "npx vite build && exec npx vite preview --host 0.0.0.0 --port 4173 --strictPort"]
