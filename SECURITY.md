# Security Policy & Credential Handling

This repository enforces a strict, zero-trust credential hygiene policy: **no sensitive credential, token, key, or private connection string may ever be committed to source control.**

---

## 1. What Is Never Committed

The following files and values must never be committed to Git:

- **Environment Files**: `.env`, `.env.local`, `.env.*.local`, and any workspace `.env` files (e.g. `apps/web/.env.local`, `packages/db/.env`).
- **Keys & Certificates**: `*.pem`, `*.key`, `*.p12`, `*.pfx`.
- **Service Account & Token Files**: `credentials.json`, `service-account*.json`, `google-token.json`, `*-token.json`.
- **High-Entropy Credentials**:
  - OpenAI / generic API keys (`sk-...`)
  - Google Gemini API keys (`AIza...`)
  - Anthropic / provider tokens (`AQ...`)
  - Neon Postgres credentials (`npg_...`)
  - GitHub personal access tokens (`ghp_...`, `gho_...`, `github_pat_...`)
  - Raw JSON Web Tokens (`eyJ...`)
  - Cookie secrets, passwords, and private HMAC keys
- **Connection Strings**: Any `postgresql://user:password@host/db` string containing a real password.

Only `.env.example` containing generic placeholder values (e.g. `your_gemini_api_key_here`, `postgresql://user:password@127.0.0.1:5432/mis_dashboard`) is permitted in version control.

---

## 2. Where Secrets Live

All sensitive credentials and connection strings live strictly outside version control:

1. **Production & Preview Deployments**:
   - Configured directly in the Vercel Project Environment Variables console (encrypted at rest).
   - Production database connections are pooled via Neon serverless connection strings with SSL enabled.
2. **Local Development**:
   - Stored in gitignored local files: `apps/web/.env.local` and `packages/db/.env`.
   - Never stage or commit `.env.local` files.
3. **Headless Verification Scripts**:
   - Exported in the local session or sourced from the operator's private secrets store (e.g. `~/.hermes/private/mis-secrets.env`).
   - Scripts read `MIS_AUTH_USERNAME` and `MIS_AUTH_PASSWORD` (or `AUTH_PASSWORD`) from the environment and terminate with a loud error if missing.

---

## 3. Automated Defenses: Secret Scanner & Git Hooks

### Built-in Secret Scanner
A dedicated TypeScript scanner is implemented in `scripts/scan-secrets.ts`. It scans all tracked files in Git, cross-references against both high-entropy pattern definitions and any live secrets present in the developer's local environment, and produces masked error diagnostics if a leak is detected.

- **Run manually**:
  ```bash
  npm run scan:secrets
  ```
- **Integrated into CI / Testing**:
  `npm test` executes the secret scanner prior to running unit tests. If any credential leak is detected, `npm test` halts with exit code 1.

### Pre-Commit Hook
A Git pre-commit hook is provided in `.githooks/pre-commit`. It intercepts commits before they are recorded:
- Blocks commits containing files matching `.env*`, `*.pem`, `*.key`, `credentials.json`, etc.
- Scans staged diffs for high-entropy credential patterns and live secrets.
- Outputs actionable remediation commands (`git reset HEAD <file>`).

To ensure the hook is active in your local clone, run:
```bash
git config core.hooksPath .githooks
```

---

## 4. Credential Rotation Procedure

If any credential or key is accidentally exposed or suspected of compromise:

1. **Immediate Revocation**: Revoke the credential immediately at the source:
   - Google AI Studio (Gemini API key)
   - DeepSeek Platform (DeepSeek API key)
   - Neon Console (Database role/password)
   - Application session secret (`COOKIE_SECRET` rotation invalidates all active sessions)
2. **Re-issuance**: Generate a new high-entropy credential.
3. **Environment Updates**:
   - Update the variable in Vercel Project Settings $\to$ Environment Variables.
   - Trigger a redeployment of production/preview deployments.
   - Update local `.env.local` files and private secret stores.
4. **History Purging**: If a credential was ever recorded in Git, the Git history must be purged immediately before pushing to remote repositories.

---

## 5. Git History Hygiene

The repository history has undergone an audit and history purge to ensure zero residual credentials or sensitive values exist in any commit object, tree, or tag.
