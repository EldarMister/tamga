FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY frontend-react/package.json frontend-react/package-lock.json /app/frontend-react/
WORKDIR /app/frontend-react
RUN npm ci

WORKDIR /app
COPY frontend /app/frontend
COPY frontend-react /app/frontend-react
WORKDIR /app/frontend-react
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY . /app
COPY --from=frontend-builder /app/frontend-react/dist /app/frontend-react/dist

EXPOSE 8000

# Render (и многие хостинги) пробрасывают порт через переменную окружения PORT.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
