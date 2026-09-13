# DeFi-Portfolio-Tracker-event-drive

Un pipeline **serverless y orientado a eventos** para seguir la actividad DeFi de
las wallets que vigilas. Un cron sin servidor lee eventos on-chain vía HTTPS RPC,
los encola, los normaliza y los guarda en DynamoDB. Una API los consulta. Sin
EC2, sin VPC, sin NAT.

```
EventBridge (cron)  ->  poller Lambda  ->  SQS  ->  normalizer Lambda  ->  DynamoDB
                                                     API Gateway  ->  api Lambda  ->  DynamoDB
```

- **poller** (`src/handlers/poller.ts`): lee transferencias ERC-20 de las wallets
  vigiladas y las encola.
- **normalizer** (`src/handlers/normalizer.ts`): consume la cola, normaliza cada
  evento a un esquema canónico y lo persiste de forma idempotente.
- **api** (`src/handlers/api.ts` / `api-lambda.ts`): sirve el historial de eventos
  y un resumen de cartera (net por token) por wallet.

## Requisitos

- Node.js >= 20 (probado con Node 22)
- Java >= 11 (para los emuladores locales de AWS)

No se necesita Docker ni AWS: el desarrollo local usa
[DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
y [ElasticMQ](https://github.com/softwaremill/elasticmq) (compatible con SQS),
ambos como procesos Java.

## Puesta en marcha (local)

```bash
# 1. Instala dependencias, descarga los emuladores y compila
bash scripts/install.sh

# 2. Arranca los emuladores (en terminales separadas)
bash scripts/start-dynamodb.sh     # DynamoDB Local en :8000
bash scripts/start-elasticmq.sh    # ElasticMQ (SQS) en :9324

# 3. Arranca el stack de la app (API + worker + cron local)
npm run dev
```

En Cloud Agents esto es automático: `scripts/install.sh` corre en la fase
`install` y las tres terminales (`dynamodb`, `elasticmq`, `app`) se definen en
[`.cursor/environment.json`](.cursor/environment.json).

## Probar el flujo completo

Con los emuladores arriba, ejecuta el pipeline de punta a punta (poll -> cola ->
normaliza -> DynamoDB -> consulta):

```bash
npm run e2e
```

O consulta la API mientras `npm run dev` está corriendo:

```bash
curl localhost:3000/health
curl localhost:3000/wallets
curl localhost:3000/wallets/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/events
curl localhost:3000/wallets/<wallet>/portfolio
```

## Configuración

Todas las variables tienen valores por defecto para desarrollo local; copia
[`.env.example`](.env.example) a `.env` solo si quieres sobreescribir algo.

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `RPC_MODE` | `mock` | `mock` (eventos sintéticos deterministas, offline) o `http` (JSON-RPC real) |
| `RPC_URL` | `https://cloudflare-eth.com` | endpoint JSON-RPC cuando `RPC_MODE=http` |
| `WATCHED_WALLETS` | 2 wallets de ejemplo | lista de direcciones `0x` separadas por comas |
| `DYNAMODB_ENDPOINT` | `http://127.0.0.1:8000` | vacío en AWS real |
| `SQS_ENDPOINT` | `http://127.0.0.1:9324` | vacío en AWS real |
| `TABLE_NAME` | `DefiEvents` | tabla DynamoDB |
| `QUEUE_NAME` | `defi-events` | cola SQS |
| `API_PORT` | `3000` | puerto de la API local |
| `POLL_INTERVAL_MS` | `15000` | frecuencia del cron local |

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run build` | compila TypeScript a `dist/` |
| `npm test` | tests unitarios (normalización, cartera, generador mock) |
| `npm run bootstrap` | crea la tabla y la cola en los emuladores |
| `npm run dev` | stack completo local (bootstrap + API + worker + cron) |
| `npm run poll` | ejecuta el poller una vez |
| `npm run e2e` | prueba de punta a punta del pipeline |

## Despliegue

[`serverless.yml`](serverless.yml) describe la topología AWS (EventBridge, SQS,
DynamoDB, API Gateway, Lambdas). El despliegue real requiere el Serverless
Framework y credenciales de AWS; los mismos handlers de `src/handlers/` se usan
tanto en local como en AWS.
