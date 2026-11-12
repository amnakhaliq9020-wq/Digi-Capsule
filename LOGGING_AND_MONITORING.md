# Logging and monitoring

Staging writes JSON lines to the process output and, when `LOG_DIR` is set, to `var/log/staging/app.log`. Backup, restore, seed, and verify also append to `var/log/staging/operations.log`.

Each line has `time`, `severity`, and `event`. API requests already carry Fastify request IDs. Delivery lines include job, notification, and template identifiers. They do not include passwords, session cookies, reset tokens, letter text, or file bytes.

`app.log` is rotated after 5 MB. Five rotated files are kept. `operations.log` is the operator record of backup and restore and should be restricted to the account that runs staging.

On Windows, limit that directory to the current user:

```powershell
icacls var\log\staging /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F"
```

## Events

| Event | When |
|---|---|
| `api.started`, `api.stopping` | API process start and Ctrl+C or SIGTERM |
| `auth.failure` | Rejected sign-in, without the email or password |
| `api.error` | Unhandled API exception, without the request body |
| `database.connection_failed` | Health check cannot query Postgres |
| `worker.started`, `worker.stopping`, `worker.tick`, `worker.queue_error` | Background worker |
| `delivery` | Email or SMS outcome identifiers |
| `backup.started`, `backup.completed`, `backup.failed` | Staging dump |
| `restore.started`, `restore.completed`, `restore.failed` | Staging restore |
| `seed.completed`, `verify.completed` | Fictional staging data |

Health is `GET /v1/health`. A database outage returns HTTP 503 and `database: down`. The error body does not include a connection string.
