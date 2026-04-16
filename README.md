# AiPhone

> **Outbound SMS for AI agents — free, Canadian, no payment required.**

AiPhone is a lightweight HTTP gateway that lets AI agents send SMS messages
from their [ClawPhone](https://clawphone.me) Canadian phone number.

ClawPhone already gives agents a free Canadian number to **receive** SMS and
extract OTP codes. AiPhone adds the missing piece: **sending** SMS from that
same number, using the same API key the agent already has.

```
Agent  ──POST /v1/numbers/:number/sms──▶  AiPhone  ──POST /v1/numbers/:number/sms──▶  api.clawphone.me
```

- **Free** — no Twilio, no carrier account, no credit card
- **Canadian numbers** — E.164 `+1` numbers provisioned by ClawPhone
- **One key** — the same `CLAWPHONE_API_KEY` is used everywhere
- **Safe retries** — `Idempotency-Key` header prevents duplicate sends
- **Zero extra dependencies** — only `dotenv`; uses Node's built-in `https`

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js ≥ 22** | Uses the built-in test runner and `node:https` |
| **ClawPhone account** | Free at [clawphone.me](https://clawphone.me) — gives you an API key and a Canadian number |
| **A public URL** | So agents (or any HTTP client) can reach AiPhone — a local tunnel like [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) works fine |

---

## Quick start

### 1 — Clone and install

```bash
git clone https://github.com/gnof-the-shark/AiPhone.git
cd AiPhone
npm install
```

### 2 — Configure

```bash
cp .env.example .env
# Open .env and paste your ClawPhone API key
```

Minimum `.env`:

```dotenv
CLAWPHONE_API_KEY=clawphone_sk_xxxxxxxxxxxxxxxxxxxx
```

Your ClawPhone API key is the one you received when you ran
`POST /v1/auth/register/verify` on `api.clawphone.me`. It starts with
`clawphone_sk_`.

### 3 — Start the server

```bash
node server.mjs
# [aiphone:server] listening { url: 'http://localhost:3000' }
```

### 4 — Expose it publicly (optional, for remote agents)

```bash
cloudflared tunnel --url http://localhost:3000
# → https://xxxx.trycloudflare.com
```

---

## API reference

### `GET /health`

Liveness probe. No authentication required.

**Response `200`**
```json
{ "ok": true, "clawphoneConfigured": true }
```

---

### `POST /v1/numbers/:number/sms`

Send an SMS from your ClawPhone Canadian number.

#### Path parameter

| Parameter | Format | Example |
|---|---|---|
| `:number` | E.164, Canadian (`+1` NANP) | `+14165550100` |

#### Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | ✅ | `Bearer <CLAWPHONE_API_KEY>` |
| `Content-Type` | ✅ | `application/json` |
| `Idempotency-Key` | optional | Any unique string — repeating the same key within 24 h returns the cached result without sending again |

#### Body

```json
{
  "to":   "+15141234567",
  "body": "Your verification code is 847291"
}
```

| Field | Type | Constraints |
|---|---|---|
| `to` | string | E.164 phone number (any country) |
| `body` | string | 1–1600 characters |

#### Response `201 — Sent`

```json
{
  "message_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "from":       "+14165550100",
  "to":         "+15141234567",
  "body":       "Your verification code is 847291",
  "status":     "sent",
  "provider":   { "message_id": "cp_abc123", "status": "sent" },
  "created_at": "2026-04-16T20:33:42.884Z"
}
```

#### Error responses

| Status | Meaning |
|---|---|
| `401` | Missing or invalid `Authorization` header |
| `422` | Invalid `from` number (must be Canadian E.164), invalid `to` number, or empty / oversized `body` |
| `502` | ClawPhone API returned an error |
| `503` | `CLAWPHONE_API_KEY` not configured on the server |

---

## Usage examples

### Step-by-step — send `"allo"` quickly

1. Create your local config:

   ```bash
   cp .env.example .env
   ```

2. Open `.env` and set your **ClawPhone API key** (ClawPhone is the SMS provider used by AiPhone):

   ```dotenv
   CLAWPHONE_API_KEY=clawphone_sk_xxxxxxxxxxxxxxxxxxxx
   ```

3. Start AiPhone:

   ```bash
   node server.mjs
   ```

4. Send the SMS (replace both phone numbers with real values):

   ```bash
   curl -X POST http://localhost:3000/v1/numbers/+14165550100/sms \
     -H "Authorization: ******" \
     -H "Content-Type: application/json" \
     -d '{"to":"+15141234567","body":"allo"}'
   ```

   Use your AiPhone auth token in `Authorization`: by default this is the same value as
   `CLAWPHONE_API_KEY` (or `API_TOKEN` if you configured an override).

5. Check the response JSON:
   - Success includes `status: "sent"` and a `message_id`.

6. For safe retries (no duplicate SMS), include an idempotency header:

   ```bash
   -H "Idempotency-Key: my-unique-id-1"
   ```

### curl

```bash
curl -X POST https://your-aiphone-url/v1/numbers/+14165550100/sms \
  -H "Authorization: Bearer clawphone_sk_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"to": "+15141234567", "body": "Hello from my AI agent!"}'
```

### curl — with idempotency key (safe retry)

```bash
curl -X POST https://your-aiphone-url/v1/numbers/+14165550100/sms \
  -H "Authorization: Bearer clawphone_sk_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-confirm-42" \
  -d '{"to": "+15141234567", "body": "Your order is confirmed."}'
# Repeating this exact request returns the same message_id — no duplicate SMS.
```

### JavaScript / Node.js

```js
const response = await fetch('https://your-aiphone-url/v1/numbers/+14165550100/sms', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer clawphone_sk_xxxxxxxxxxxxxxxxxxxx',
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({
    to:   '+15141234567',
    body: 'Hello from my AI agent!',
  }),
});

const result = await response.json();
console.log(result.message_id); // "3fa85f64-..."
```

### Python

```python
import requests

resp = requests.post(
    "https://your-aiphone-url/v1/numbers/+14165550100/sms",
    headers={
        "Authorization": "Bearer clawphone_sk_xxxxxxxxxxxxxxxxxxxx",
        "Content-Type":  "application/json",
    },
    json={
        "to":   "+15141234567",
        "body": "Hello from my AI agent!",
    },
)
print(resp.json())
```

### OpenClaw / AI agent skill

Add this to your agent's skill file so it knows it can send SMS:

```markdown
## Send SMS

To send an SMS from your ClawPhone number, call:

POST https://your-aiphone-url/v1/numbers/<your-clawphone-number>/sms
Authorization: Bearer <CLAWPHONE_API_KEY>
Content-Type: application/json

{ "to": "<E.164 destination>", "body": "<message text>" }

Use Idempotency-Key: <unique-id> to safely retry without sending twice.
```

---

## Configuration reference

All configuration is via environment variables (loaded from `.env`).
Variables already in the environment take precedence over `.env`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `CLAWPHONE_API_KEY` | — | **Required.** Your ClawPhone API key (`clawphone_sk_…`) — used both to authenticate agents and to call the ClawPhone API |
| `CLAW_API_KEY` | — | Backward-compatible alias for `CLAWPHONE_API_KEY` |
| `API_TOKEN` | _(same as `CLAWPHONE_API_KEY`)_ | Override the bearer token agents must send, if you want it to differ from your ClawPhone key |
| `CLAWPHONE_API_URL` | `https://api.clawphone.me/v1` | Override for self-hosted ClawPhone gateways |
| `SMS_BODY_MAX_CHARS` | `1600` | Maximum SMS body length (10 GSM-7 segments) |
| `IDEMPOTENCY_TTL_MS` | `86400000` | How long (ms) an `Idempotency-Key` is remembered (default: 24 h) |

---

## How it works

1. Your AI agent provisions a **free Canadian number** via [ClawPhone](https://clawphone.me): `POST https://api.clawphone.me/v1/numbers`
2. ClawPhone pushes **inbound SMS** to the agent's webhook (OTPs, replies, etc.)
3. When the agent needs to **send** an SMS, it calls AiPhone: `POST /v1/numbers/:number/sms`
4. AiPhone validates the request, checks the idempotency store, then forwards it to `POST https://api.clawphone.me/v1/numbers/:number/sms` using the same API key
5. ClawPhone delivers the message via its carrier — **no extra accounts, no billing**

---

## Running tests

```bash
npm test
```

33 tests covering E.164 validation, Canadian number validation, business logic
(happy path, idempotency, provider errors), and HTTP integration (auth, 422s,
idempotency deduplication, 502, 404).

---

## License

MIT
