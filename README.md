# oscar-webinterface

Node.js-Web-Oberfläche für die [Open OSCAR Server](https://github.com/mk6i/open-oscar-server) **Management API** (siehe `open-oscar-server/api.yml`). Der eingebaute Express-Proxy spricht die API unter `OSCAR_API_URL` an und vermeidet CORS-Probleme im Browser.

## Voraussetzungen

- Node.js **18+**
- Laufender Open OSCAR Server mit erreichbarem `API_LISTENER` (Standard `http://127.0.0.1:8080`)

## Start

```powershell
cd e:\wwwroot\oscar-webinterface
copy .env.example .env
npm install
npm start
```

Anschließend im Browser: **http://127.0.0.1:3333**

## Konfiguration (`.env`)

| Variable | Bedeutung |
|----------|-----------|
| `OSCAR_API_URL` | Basis-URL der Management-API |
| `PORT` | Port dieser Oberfläche (Standard `3333`) |
| `OSCAR_BASIC_AUTH` | Optional `user:pass` für einen festen `Authorization: Basic`-Header Richtung API |

## Entwicklung

```powershell
npm run dev
```

(Wiederstart bei Änderungen an `server/index.mjs` über `node --watch`.)

## Projektstruktur

- `server/index.mjs` – Express, `/api/*`-Proxy, `/meta`, statische Dateien aus `public/`
- `public/` – statische UI (Vanilla JS)
- `open-oscar-server/` – Referenz-Quellcode des Servers (lokal mitgelegt)
