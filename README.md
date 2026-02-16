# Тамга Сервис

Тамга Сервис — CRM-система для полиграфии: заказы, склад, сотрудники, инциденты, задачи, уроки и зарплата.

## Возможности

- Управление заказами и этапами производства
- Склад материалов и журнал движений
- Учет сотрудников и ролей (`director`, `manager`, `designer`, `master`, `assistant`)
- Кадры: смены, инциденты, штрафы
- Отдельная страница `Журнал штрафов` (фильтры по датам/сотруднику, сумма удержаний)
- Задачи сотрудникам: дневные и недельные
- Уроки: YouTube + фото (ссылкой или загрузкой)
- Зарплата: ежемесячный расчет
- Директорский финансовый дашборд + экспорт CSV

## Технологии

- Backend: FastAPI
- Database: PostgreSQL (основная), SQLite (fallback без `POLYCONTROL_DATABASE_URL`)
- Frontend: Vanilla JS + CSS

## Локальный запуск (PostgreSQL)

Требования:
- Python 3.11+ (рекомендуется 3.12)
- PostgreSQL 14+

### 1. Создайте БД и пользователя

Пример в `psql`:

```sql
CREATE DATABASE tamga_service;
CREATE USER tamga_user WITH PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE tamga_service TO tamga_user;
```

### 2. Настройте переменные окружения

PowerShell:

```powershell
$env:POLYCONTROL_SECRET="change-this-secret"
$env:POLYCONTROL_DATABASE_URL="postgresql://tamga_user:strong_password@localhost:5432/tamga_service"
```

### 3. Установите зависимости и запустите

```powershell
py -3 -m pip install -r backend/requirements.txt
py -3 run.py
```

Открыть: `http://127.0.0.1:8000`

Если БД пустая — будет создан пользователь директора:
- Логин: `admin`
- Пароль: `admin123`

## Деплой на хостинг (Docker)

### 1. Подготовка

```powershell
copy .env.example .env
```

Заполните `.env`:
- `POLYCONTROL_SECRET`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

### 2. Запуск

```powershell
docker compose up -d --build
```

Сервисы:
- `app` — FastAPI (`:8000`)
- `db` — PostgreSQL

Данные сохраняются в:
- `./pgdata` — PostgreSQL
- `./data` — загруженные файлы

## Переменные окружения

- `POLYCONTROL_SECRET` — секрет подписи токенов
- `POLYCONTROL_DATABASE_URL` — URL подключения к PostgreSQL
- `POLYCONTROL_DB_PATH` — путь к SQLite (если Postgres не задан)
- `POLYCONTROL_UPLOAD_DIR` — путь к папке загрузок

## Структура проекта

- `backend/` — API, БД, бизнес-логика
- `frontend/` — SPA-интерфейс
- `run.py` — локальный запуск
- `docker-compose.yml`, `Dockerfile` — запуск в контейнерах

## Журнал штрафов

В системе есть отдельная страница `#/fines`:
- фильтр по периоду (`С` / `По`);
- фильтр по сотруднику;
- список штрафов с комментарием, кем и когда назначен;
- сводка: количество штрафов и общая сумма удержаний.

Переход в интерфейсе:
- `Ещё` → `Журнал штрафов`.

## Реальное время

Сейчас система многопользовательская (все сотрудники работают с одной БД), но без push-канала.

Это значит:
- одновременная работа сотрудников поддерживается;
- изменения видны после действий/переходов между разделами;
- для мгновенных автообновлений без ручного обновления нужны WebSocket/SSE или polling.
