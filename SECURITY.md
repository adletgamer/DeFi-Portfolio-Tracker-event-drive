# Security audit

**Date:** 2026-09-14  
**Scope:** this repository (application code, CDK, docs, git history). No live AWS IAM review.

This document records what was found, what was fixed in-tree, and what still needs an operator action. It does **not** repeat previously committed account identifiers.

---

## English

### Executive summary

No live AWS access keys, RPC API keys, or private keys were found in the working tree. Documentation had committed a **12-digit AWS account ID** and full resource ARNs (Lambda, SQS, DynamoDB, Secrets Manager). That is account fingerprinting, not a password, but it is still sensitive inventory data and has been removed from current files.

The Read API is intentionally public (`Function URL` auth `NONE`) with `CORS *`. Anyone who knows or guesses a wallet address can query positions and watchlist membership.

Git history still contains the redacted values. Rewriting published history is **not** done in this change (it would force-push the PR). Treat the old commits as public and follow the operator actions below if that account ID must disappear.

### Findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| S1 | **High** | AWS account ID + ARNs committed in `README.md` (account inventory / targeting) | **Fixed in current tree** (placeholders). Still in git history. |
| S2 | **High** | ReadApi Function URL has `authType: NONE` — unauthenticated internet access to `/positions` and `/watchlist` | Open (by design for the demo UI). Harden before production. |
| S3 | **Medium** | Lambda logged the full HTTP event (wallet address in CloudWatch) | **Fixed** — log method + path only |
| S4 | **Medium** | 500 responses returned `error.message` (can leak AWS/DynamoDB internals) | **Fixed** — generic 500 body |
| S5 | **Medium** | `Access-Control-Allow-Origin: *` lets any website call the API from a browser | Open until an Amplify (or other) origin is known |
| S6 | **Low** | DynamoDB `RemovalPolicy.DESTROY`, no PITR, AWS-owned encryption | Open |
| S7 | **Low** | Secrets Manager secret name is public; rotate the RPC key if a real value was ever stored | Operator action |
| S8 | **Low** | `package.json` / `LICENSE` contain a personal GitHub handle (copyright) | Documented; LICENSE left unchanged |

No `AKIA…` keys, PEM files, `.env` secrets, or Infura/Alchemy keys were found in tracked files. `.env` is gitignored. `.env.example` uses dummy `local` credentials for emulators only.

### Operator actions (do these in AWS / GitHub)

1. **Assume the account ID in old commits is public.** Enable CloudTrail, GuardDuty, and billing alerts. Restrict IAM users/keys. Do not create long-lived access keys for this project.
2. **If a real RPC key was put in Secrets Manager**, rotate it at Infura/Alchemy and `put-secret-value` the new key.
3. **Optional history purge:** `git filter-repo` (or BFG) to strip the old README, then rotate anything that history might still imply. Coordinate with anyone who cloned the repo.
4. **Production ReadApi:** switch Function URL auth to `AWS_IAM` (or put API Gateway + a key/JWT in front). Restrict CORS to the frontend origin.
5. Enable **GitHub secret scanning** and push protection on this repository.
6. Run `npm test` (includes a regression that fails if 12-digit AWS account IDs reappear in docs).

### In-repo remediations in this change

- README deploy outputs use `<ACCOUNT_ID>` / `<READ_API_URL>` placeholders; real values come from `npx cdk deploy`.
- ReadApi no longer logs query strings or returns internal exception text.
- Demo screenshots and the walkthrough video live under `frontend/demo/` (no account IDs in those assets).

---

## Español

### Resumen

No hay access keys ni claves RPC en el árbol de trabajo. El README sí llegó a publicar el **ID de cuenta AWS** y ARNs completos. Eso ya no está en los archivos actuales; **sigue en el historial de git**.

La API de lectura es pública (Function URL sin auth). Cualquiera puede consultar posiciones si conoce una wallet.

### Qué hacer tú

1. Tratar el ID de cuenta de los commits viejos como público: CloudTrail, GuardDuty, alertas de facturación.
2. Rotar la API key de RPC si alguna vez se guardó una real en Secrets Manager.
3. Si necesitas borrar el historial, usa `git filter-repo` (no se hace en este PR).
4. Antes de producción: autenticar ReadApi y limitar CORS al dominio del frontend.

Ver la tabla de findings en la sección inglesa.
