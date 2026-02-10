# RabbitMQ Playground

Практические примеры работы с RabbitMQ на TypeScript/Node.js — от базового pub-sub до кластеризации и performance-тестирования.

**Стек:** Node.js, TypeScript, amqplib, Docker, Docker Compose

## Пререквизиты

- Docker + Docker Compose
- Node.js >= 18
- pnpm

## Структура репозитория

| # | Директория | Описание |
|---|-----------|----------|
| 1 | `1. Pub-sub/` | Topic exchange, request-reply через replyTo/correlationId |
| 2 | `2. Publisher_confirm/` | Три стратегии подтверждения: sync, batch, async |
| 3 | `3. RPC/` | Request-response через exclusive reply queue + Express.js |
| 4 | `4. Alternate_exchange/` | Fallback-роутинг нераспределённых сообщений |
| 5 | `5. Consistent_hash/` | Распределение по хешу routing key с весами |
| 6 | `6. DLX/` | Dead Letter Exchange с TTL и nack-based retry |
| 7.1 | `7.1. Delay_schedule_custom/` | DLX+TTL retry loop, alternate exchange для poison messages |
| 7.2 | `7.2. Delay_schedule_custom_exponential_backoff/` | Ограниченный retry с 3 уровнями задержки |
| 7.3 | `7.3. Delay_schedule_plugin/` | Нативный плагин rabbitmq_delayed_message_exchange |
| 8 | `8. Event-based_microservices /` | NestJS + @golevelup/nestjs-rabbitmq + MongoDB |
| 9 | `9. clusterization/` | 3-node cluster, HAProxy, Shovels |
| 10 | `10. performance-comparison/` | Бенчмарки prefetch, manual/auto ACK, clinic.js |

## Быстрый старт

### 1. Поднять RabbitMQ

```bash
docker compose up -d
```

Корневой `docker-compose.yml` поднимает один инстанс RabbitMQ с management UI:
- AMQP: `localhost:5672`
- Management UI: `http://localhost:15672` (user/password)

### 2. Запустить пример

```bash
cd "1. Pub-sub"
pnpm install
npx tsx subscriber.ts   # терминал 1
npx tsx publisher.ts    # терминал 2
```

Для Dockerized-примеров (2, 7.1, 7.2, 9, 10):

```bash
cd "<директория примера>"
docker compose up
```

---

## 1. Pub-Sub

**Концепция:** базовый паттерн publish-subscribe с topic exchange и request-reply через `replyTo`/`correlationId`.

### Архитектура

```
Publisher                              Subscriber
   |                                      |
   |-- publish('test', 'my.command') ---->|
   |   replyTo=<reply_queue>              |
   |   correlationId='1'                  |
   |                                      |
   |<-- sendToQueue(replyTo, response) ---|
   |    correlationId='1'                 |
```

- **Exchange:** `test` (type: `topic`, durable)
- **Queue:** `my-cool-queue` (durable), binding key `my.command`
- **Reply queue:** exclusive anonymous queue у publisher

### Поток сообщений

1. Publisher отправляет сообщение в exchange `test` с routing key `my.command`
2. Exchange маршрутизирует сообщение в `my-cool-queue`
3. Subscriber проверяет наличие `replyTo` — если есть, отвечает в reply queue
4. Publisher получает ответ из reply queue, коррелируя по `correlationId`

### Запуск

```bash
cd "1. Pub-sub"
pnpm install
npx tsx subscriber.ts
npx tsx publisher.ts
```

---

## 2. Publisher Confirm

**Концепция:** гарантия доставки сообщений брокеру через механизм publisher confirms. Три стратегии с разными характеристиками производительности.

### 2.1 Синхронное подтверждение

Каждое сообщение подтверждается отдельным вызовом `waitForConfirms()`.

```
Publisher --> sendToQueue --> waitForConfirms() --> следующее сообщение
                                  |
                            ~150 MPS
```

- Канал: `createConfirmChannel()`
- После каждого `sendToQueue` вызывается `await channel.waitForConfirms()`
- Максимальная надёжность, минимальная пропускная способность

**Переменные окружения:**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `SRC_URI` | AMQP URI | — |
| `QUEUE` | Имя очереди | — |
| `COUNT` | Количество сообщений | `100000` |

**Запуск:**

```bash
cd "2. Publisher_confirm/1.sync-confirmation"
docker compose up
```

### 2.2 Batch подтверждение

Сообщения группируются в батчи, подтверждение — после отправки всего батча.

```
Publisher --> [msg1, msg2, ..., msgN] --> waitForConfirms()
                                              |
                                        nack? --> retry (exponential backoff)
                                              |
                                        max retries? --> DLX (ex.last-hope.dlx)
                                              |
                                        DLX fail? --> файл ./tmp/<timestamp>.json
```

- **BackpressureManager** — ограничивает количество одновременных flush-операций
- Слоты делятся между primary (отправка) и retry (повторы)
- После исчерпания `MAX_RETRIES` — маршрутизация в DLX exchange `ex.last-hope.dlx`
- Если DLX тоже недоступен — запись в локальный файл

**Переменные окружения:**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `SRC_URI` | AMQP URI | — |
| `QUEUE` | Failable queue | — |
| `QUEUE_NORMAL` | Normal queue | — |
| `COUNT` | Количество сообщений | `100000` |
| `BATCH_SIZE` | Размер батча | `100` |
| `MAX_RETRIES` | Макс. количество повторов | `2` |
| `MAX_CONCURRENT_HANDLERS` | Макс. параллельных flush | `100` |
| `RETRIES_PERCENTAGE` | % сообщений в failable queue | `10` |

**Запуск:**

```bash
cd "2. Publisher_confirm/2.batch-confirmation"
docker compose up
```

### 2.3 Асинхронное подтверждение

Event-driven подход: callback при отправке + обработка `nack` событий.

```
Publisher --> sendToQueue(cb) --> cb(err) --> если nack:
                                                |
                                          outstanding Map<seq, PendingMessage>
                                                |
                                          retry с exponential backoff
                                                |
                                          max retries? --> DLX
```

- Каждое сообщение отправляется с callback-функцией
- При nack — сообщение сохраняется в `outstanding` Map по sequence number
- Retry с задержками: `[1000ms, 2000ms, ...]`
- BackpressureManager аналогичен batch-варианту

**Переменные окружения:**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `SRC_URI` | AMQP URI | — |
| `QUEUE` | Failable queue | — |
| `QUEUE_NORMAL` | Normal queue | — |
| `COUNT` | Количество сообщений | `100000` |
| `MAX_RETRIES` | Макс. количество повторов | `2` |
| `MAX_CONCURRENT_HANDLERS` | Макс. параллельных операций | `300` |
| `RETRIES_PERCENTAGE` | % сообщений в failable queue | `10` |

**Запуск:**

```bash
cd "2. Publisher_confirm/3.async-confirmation"
docker compose up
```

---

## 3. RPC (Remote Procedure Call)

**Концепция:** request-response через RabbitMQ. Express.js-клиент отправляет запрос, RabbitMQ-сервер обрабатывает и возвращает результат.

### Архитектура

```
HTTP Client                    RPC Client (Express:3001)                RPC Server
     |                              |                                      |
     |-- POST /operate ------------>|                                      |
     |                              |-- sendToQueue('q.rpc') ------------->|
     |                              |   replyTo=<exclusive_queue>          |
     |                              |   correlationId=uuid                 |
     |                              |                                      |
     |                              |   MessageHandler.processMessage()    |
     |                              |                                      |
     |                              |<-- sendToQueue(replyTo, result) -----|
     |<-- { response: 42 } --------|   correlationId=uuid                 |
```

- **Queue:** `q.rpc` — единая очередь для RPC-запросов
- **Reply queue:** exclusive anonymous queue на стороне клиента
- **Корреляция:** `correlationId` (UUID) + EventEmitter для матчинга ответов
- **Операции:** `multiply`, `division` — серверная обработка математических операций

### Запуск

```bash
cd "3. RPC"
pnpm install

# Терминал 1: RPC-сервер
pnpm server

# Терминал 2: Express-клиент (порт 3001)
pnpm client

# Отправка запроса
curl -X POST http://localhost:3001/operate \
  -H "Content-Type: application/json" \
  -d '{"operation": "multiply", "num1": 6, "num2": 7}'
```

---

## 4. Alternate Exchange

**Концепция:** fallback-маршрутизация. Если сообщение не совпало ни с одним binding на основном exchange — оно направляется в alternate exchange вместо того, чтобы быть отброшенным.

### Архитектура

```
Publisher
   |
   |-- routing key 'message.key' --> ex.main (direct)
   |                                    |
   |                    binding 'message.key'        alternate-exchange
   |                         |                            |
   |                    q.messages              ex.alternate (fanout)
   |                                                      |
   |                                             q.alternate.messages
   |
   |-- routing key 'xyz' ---------> ex.main (direct)
                                        |
                          нет binding --> alternate-exchange
                                              |
                                     q.alternate.messages
```

- **Main exchange:** `ex.main` (type: `direct`) с параметром `alternateExchange: 'ex.alternate'`
- **Alternate exchange:** `ex.alternate` (type: `fanout`)
- Сообщения с routing key `message.key` → `q.messages`
- Сообщения с неизвестным routing key → `q.alternate.messages`

### Запуск

```bash
cd "4. Alternate_exchange"
pnpm install
npx tsx rabbit/server.ts   # консьюмер
npx tsx rabbit/client.ts   # паблишер
```

---

## 5. Consistent Hash Exchange

**Концепция:** распределение сообщений между очередями на основе хеша routing key. Каждая очередь имеет вес (routing key при binding), определяющий пропорцию получаемых сообщений.

### Архитектура

```
Publisher (100k messages, routing key = i)
   |
   v
ex.consistent_hash (x-consistent-hash)
   |
   |-- weight '1' --> q1  (~16.7%)
   |-- weight '1' --> q2  (~16.7%)
   |-- weight '2' --> q3  (~33.3%)
   |-- weight '2' --> q4  (~33.3%)
```

- **Exchange:** `ex.consistent_hash` (type: `x-consistent-hash`)
- **Плагин:** `rabbitmq_consistent_hash_exchange`
- Routing key при binding задаёт вес очереди (строковое число)
- q1 и q2 с весом `1` получают в два раза меньше сообщений, чем q3 и q4 с весом `2`

### Запуск

```bash
cd "5. Consistent_hash"
pnpm install
npx tsx server.ts
```

---

## 6. DLX (Dead Letter Exchange)

**Концепция:** маршрутизация «мёртвых» сообщений в отдельный exchange. Сообщения попадают в DLX при: явном `nack`/`reject`, истечении TTL, переполнении очереди.

### Архитектура

```
Publisher --> ex.main (direct) --> q.messages
                                     |
                                     |-- nack (requeue=false)
                                     |-- TTL 5000ms expired
                                     v
                                 ex.dlx (fanout) --> q.dlx.messages
                                                        |
                                                   ack через 5s
```

- **Main exchange:** `ex.main` (direct)
- **DLX exchange:** `ex.dlx` (fanout)
- **Queue:** `q.messages` с параметрами:
  - `x-dead-letter-exchange: 'ex.dlx'`
  - `x-message-ttl: 5000`
- Консьюмер делает `channel.nack(msg, false, false)` — сообщение уходит в DLX
- DLX-консьюмер обрабатывает сообщение через 5 секунд

### Запуск

```bash
cd "6. DLX"
pnpm install
npx tsx rabbit/server.ts   # консьюмер
npx tsx rabbit/client.ts   # паблишер
```

---

## 7.1. Delayed Retry (бесконечный)

**Концепция:** бесконечный retry loop через DLX + TTL. Reject'нутое сообщение попадает в retry-очередь с TTL, после истечения TTL — возвращается в inbox-очередь. Poison messages уходят в alternate exchange.

### Архитектура

```
Publisher --> ex.{EXCHANGE} (direct, alternate-exchange='ex.last-hope')
                |
                |-- routing key '{ROUTINGKEY}' --> q.{QUEUE}
                |                                     |
                |-- unknown routing key ------------->|
                                                      |
                                              ex.last-hope (fanout)
                                                      |
                                                 q.last-hope

q.{QUEUE} (x-dead-letter-exchange='ex.{QUEUE}.fail')
   |
   |-- reject/nack --> ex.{QUEUE}.fail (direct)
   |                       |
   |                  q.{QUEUE}.retry.dlx
   |                  (TTL={RETRY_QUEUE_TTL}, x-dead-letter-exchange='ex.{QUEUE}.retry')
   |                       |
   |                  TTL expired --> ex.{QUEUE}.retry (direct)
   |                                      |
   |<------ routing key 'retry' ----------|
```

**Переменные окружения (consumer):**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `QUEUE` | Имя очереди | — |
| `EXCHANGE` | Имя exchange | — |
| `ROUTINGKEY` | Routing key | — |
| `PREFETCH` | prefetch_count | `5` |
| `FAIL` | Эмуляция reject на 50% сообщений | `false` |
| `REJECTALL` | Reject всех сообщений | `false` |
| `SLEEP` | Задержка обработки, ms | `0` |
| `RETRY_QUEUE_TTL` | TTL retry-очереди, ms | `15000` |

**Переменные окружения (publisher):**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `EXCHANGE` | Имя exchange | — |
| `ROUTINGKEY` | Routing key | — |
| `COUNT` | Количество сообщений | `100000` |
| `SLEEP` | Задержка между публикациями, ms | `0` |

Publisher также эмулирует poison messages: ~10% сообщений отправляется с неизвестным routing key, который не матчится ни одним binding на `ex.{EXCHANGE}` и попадает в `ex.last-hope` через alternate exchange.

### Запуск

```bash
cd "7.1. Delay_schedule_custom"

# Поднять RabbitMQ (из корневого docker-compose или локального)
docker compose up -d

# Создать сеть (если ещё не создана)
docker network create rabbitmq-share-net

# Consumer и Publisher — отдельные docker-compose:
docker compose -f consumer/docker-compose.yml up
docker compose -f publisher/docker-compose.yml up

# Или всё сразу:
npm run docker
```

---

## 7.2. Delayed Retry (exponential backoff)

**Концепция:** ограниченный retry с тремя уровнями задержки. Каждый уровень — отдельная DLX-очередь с увеличивающимся TTL. После исчерпания попыток (RETRY_THRESHOLD) сообщение попадает в `ex.last-hope`.

### Архитектура

```
q.{QUEUE} (x-dead-letter-exchange='ex.last-hope')
   |
   |-- error, retry_count < RETRY_THRESHOLD:
   |       publish to 'ex.delay-router' с routing key 'delay{N}'
   |       headers: x-retry-count = N
   |
   |-- error, retry_count >= RETRY_THRESHOLD:
   |       reject --> ex.last-hope --> q.last-hope
   |
   v
ex.delay-router (direct)
   |
   |-- 'delay1' --> q.{QUEUE}.retry1.dlx (TTL = BASE_DELAY)
   |-- 'delay2' --> q.{QUEUE}.retry2.dlx (TTL = BASE_DELAY * 2)
   |-- 'delay3' --> q.{QUEUE}.retry3.dlx (TTL = BASE_DELAY * 3)
   |                      |
   |               TTL expired --> ex.{QUEUE}.retry.dlx (fanout)
   |                                     |
   |<--------- возврат в q.{QUEUE} ------|
```

**Переменные окружения (consumer):**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `QUEUE` | Имя очереди | — |
| `EXCHANGE` | Имя exchange | — |
| `ROUTINGKEY` | Routing key | — |
| `PREFETCH` | prefetch_count | `5` |
| `FAIL` | Эмуляция reject на 50% сообщений | `false` |
| `REJECTALL` | Reject всех сообщений | `false` |
| `SLEEP` | Задержка обработки, ms | `0` |
| `RETRY_THRESHOLD` | Макс. количество попыток | `3` |
| `BASE_DELAY` | Базовая задержка retry, ms | `15000` |
| `RETRY_QUEUE_TTL` | TTL базовой retry-очереди, ms | `15000` |

### Запуск

```bash
cd "7.2. Delay_schedule_custom_exponential_backoff"

docker compose up -d
docker network create rabbitmq-share-net

docker compose -f consumer/docker-compose.yml up
docker compose -f publisher/docker-compose.yml up

# Или всё сразу:
npm run docker
```

---

## 7.3. Delayed Message Plugin

**Концепция:** отложенная доставка через DLX + TTL. Сообщение публикуется в очередь с `x-message-ttl`, по истечении TTL — попадает через DLX в целевую очередь. Плагин `rabbitmq_delayed_message_exchange` подключён для более продвинутых сценариев (задержка на уровне exchange через заголовок `x-delay`).

### Архитектура

```
Publisher --> ex.main (direct) --> q.messages
                                     |
                               TTL 5000ms (x-message-ttl)
                               нет консьюмера на q.messages
                                     |
                                 ex.dlx (fanout) --> q.dlx.messages
                                                        |
                                                   consume (noAck)
```

- **Exchange:** `ex.main` (direct) — приём сообщений
- **Queue:** `q.messages` с `x-message-ttl: 5000` и `x-dead-letter-exchange: 'ex.dlx'`
- **DLX exchange:** `ex.dlx` (fanout) → `q.dlx.messages`
- Сообщение задерживается на 5 секунд в `q.messages`, затем автоматически попадает в `q.dlx.messages`

### Запуск

```bash
cd "7.3. Delay_schedule_plugin"
pnpm install
npx tsx rabbit/server.ts   # консьюмер
npx tsx rabbit/client.ts   # паблишер
```

---

## 8. Event-based Microservices

**Концепция:** event-driven архитектура на NestJS с RabbitMQ как message broker. Gateway принимает HTTP-запросы, публикует в RabbitMQ, stock-сервис обрабатывает и возвращает результат через RPC.

### Архитектура

```
HTTP Client --> Gateway (NestJS, :3000)
                   |
                   |-- amqpConnection.request()
                   |   exchange='stock', routingKey='stock-route'
                   |
                   v
              RabbitMQ (topic exchange 'stock')
                   |
                   v
            Service-Stock (NestJS)
                   |
                   |-- @RabbitRPC({ queue: 'stock-queue' })
                   |-- MongoDB (mongoose)
                   |
                   v
              return result --> Gateway --> HTTP Response
```

**Стек:**
- NestJS + `@golevelup/nestjs-rabbitmq`
- MongoDB + Mongoose
- Docker Compose (rabbitmq + mongodb + gateway + service-stock)

### Запуск

```bash
cd "8. Event-based_microservices "
pnpm install   # или yarn
docker compose up
```

Gateway доступен на `http://localhost:3000`.

```bash
curl -X POST http://localhost:3000/create-stock
```

---

## 9. Кластеризация

**Концепция:** кластер из 3 нод RabbitMQ с HAProxy для балансировки, Shovels для переноса сообщений из внешнего RabbitMQ в кластер, HA policies для репликации очередей.

### Архитектура

```
External Publisher --> rabbitmq-external (:15675)
                            |
                       [Shovel: q.external --> ex.from-external]
                       [ack-mode: on-confirm]
                            |
                            v
                    HAProxy (:15671, :5672)
                    /       |        \
               rabbitmq1  rabbitmq2  rabbitmq3
               (:15672)   (:15673)   (:15674)
                    \       |        /
                     ex.from-external (direct)
                            |
                     q.from-external (quorum queue)
```

**Компоненты:**
- **3 ноды кластера** с общим `RABBITMQ_ERLANG_COOKIE`
- **HAProxy** — TCP-балансировка (roundrobin для AMQP, failover для Management UI)
- **rabbitmq-external** — внешний RabbitMQ для демонстрации Shovels
- **Сеть:** `rabbitmq-share-net` (external Docker network)

### Кластеризация

Скрипт `1.join-cluster.sh` выполняется на rabbitmq2 и rabbitmq3:
```
rabbitmqctl stop_app → reset → join_cluster rabbit@rabbitmq1 → start_app
```

### HA Policies

Скрипт `2.replicate-classic-queue.sh` настраивает HA policy:
- Все очереди реплицируются минимум на 2 ноды
- Режим: `ha-mode: exactly`, `ha-params: 2`
- Синхронная репликация: `ha-sync-mode: automatic`

### Shovels

Конфигурация переноса сообщений:
- **Источник:** `q.external` на rabbitmq-external
- **Назначение:** `ex.from-external` (direct) → `q.from-external` (quorum queue) в кластере
- **ACK mode:** `on-confirm` — подтверждение после записи в destination
- **Reconnect delay:** 10 секунд

### HAProxy конфигурация

- **AMQP (5672):** roundrobin по 3 нодам с health check (1s interval)
- **Management UI (15672):** primary-backup (r1 primary, r2/r3 backup)

### Запуск

```bash
cd "9. clusterization"

# Создать сеть
docker network create rabbitmq-share-net

# Запустить всё (кластер + shovels + external publisher)
npm run docker

# Отдельные команды:
npm run clusterize      # присоединить ноды к кластеру
npm run setup-shovel    # настроить shovels
npm run clean           # удалить контейнеры и volumes
```

### Management UI

| Компонент | URL | Credentials |
|-----------|-----|-------------|
| rabbitmq1 | http://localhost:15672 | rmuser/rmpassword |
| rabbitmq2 | http://localhost:15673 | rmuser/rmpassword |
| rabbitmq3 | http://localhost:15674 | rmuser/rmpassword |
| HAProxy | http://localhost:15671 | rmuser/rmpassword |
| rabbitmq-external | http://localhost:15675 | rmuser/rmpassword |

---

## 10. Performance Comparison

**Концепция:** бенчмарки для сравнения производительности различных стратегий публикации и потребления сообщений. Включает поддержку clinic.js для профилирования.

### Инфраструктура

Аналогична кластеризации: 3 ноды + HAProxy + внешний RabbitMQ + Shovels.

### Consumer

Консьюмер поддерживает два режима:
- **Auto ACK** (`MANUAL_ACK=false`, `noAck: true`)
- **Manual ACK** (`MANUAL_ACK=true`) с настраиваемым `PREFETCH`

**Переменные окружения:**

| Переменная | Описание | По умолчанию |
|------------|----------|-------------|
| `QUEUE` | Имя очереди | — |
| `PREFETCH` | prefetch_count | `1` |
| `MANUAL_ACK` | Ручное подтверждение | `true` |
| `SLEEP` | Задержка обработки, ms | `0` |

### Запуск

```bash
cd "10. performance-comparison"
pnpm install

# Запуск с clinic.js профилированием
npm start

# Запуск кластера
npm run docker
```

---

## Плагины RabbitMQ

Подключённые плагины (`rabbitmq_enabled_plugins`):

| Плагин | Описание | Используется в |
|--------|----------|---------------|
| `rabbitmq_management` | Web UI для управления и мониторинга | Все примеры |
| `rabbitmq_consistent_hash_exchange` | Exchange с хеш-распределением | #5 Consistent Hash |
| `rabbitmq_delayed_message_exchange` | Отложенная доставка сообщений | #7.3 Delay Plugin |
| `rabbitmq_shovel` | Перенос сообщений между брокерами | #9 Кластеризация, #10 Performance |
| `rabbitmq_shovel_management` | UI для управления Shovels | #9 Кластеризация, #10 Performance |

## Бенчмарки

### Publishing

| Стратегия | 0% retries | 10% retries | 100% retries |
|-----------|-----------|-------------|-------------|
| Без подтверждения | 60k MPS | — | — |
| Sync confirmation | 150 MPS | — | — |
| Async confirmation | 40k MPS | 20-25k MPS | 5-6k MPS |

**Async confirmation при 10% retries (детали):**

| max concurrent handlers | MPS | Memory |
|------------------------|-----|--------|
| 10 (3 primary) | 20k | 300 MB |
| 100 (33 primary) | 25k | 360 MB |

**Async confirmation при 100% retries:**

| max concurrent handlers | MPS | Memory |
|------------------------|-----|--------|
| 10 (3 primary) | 5k | 900 MB |
| 100 (33 primary) | 5.5k | 1100 MB |
| 300 (100 primary) | 6.2k | 1000 MB |

### Consuming

| Режим | Настройки | MPS | Capacity |
|-------|----------|-----|----------|
| Auto ACK | — | 90k | 100% |
| Manual ACK | prefetch=1 | 4.7k | 12% |
| Manual ACK | prefetch=10 | 22k | 36% |
| Manual ACK | prefetch=100 | 55k | 70% |

### rabbitmq-perf-test

В файле `perf-tests.txt` собраны готовые команды для [rabbitmq-perf-test](https://github.com/rabbitmq/rabbitmq-perf-test) (Java):

| Тест | Описание |
|------|----------|
| Simple test | 1 producer, 2 consumers, autoack, 1KB messages |
| Frame size | Влияние framemax (5KB vs 1MB) на пропускную способность при 1MB сообщениях |
| Queue args | x-max-length, x-max-priority, x-dead-letter-exchange |
| Lazy Queue | Сравнение lazy vs default queue (50 producers, 0 consumers) |
| RampUp | Постепенное увеличение нагрузки (10 инстансов с интервалом 10s) |
| Many queues | Сравнение: 1 queue vs 10 queues, 1 connection vs 10 connections |
| IoT | 2000 producers, publishing-interval=1s, 512B messages, persistent |

---

## Roadmap

### Инфраструктура
- [ ] HA policies — mirrored queues, failover-сценарии
- [ ] Quorum Queues — RAFT-based очереди, сравнение с classic mirrored
- [ ] Prometheus + Grafana — мониторинг, дашборды, алерты
- [ ] TLS — шифрование через HAProxy + Let's Encrypt
- [ ] Federation — active-active disaster recovery

### Продвинутые паттерны
- [ ] Priority Queues — приоритизация, тестирование starvation-сценариев
- [ ] QoS — prefetch counts, bursty loads, slow consumers
- [ ] Avro/Protobuf сериализация — schema validation в consumers
