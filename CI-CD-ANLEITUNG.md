# Blueprint: AI-Powered Docker CI/CD Pipeline (Self-Hosted)

Gib diese Anleitung einer KI, um ein Docker CI/CD System für Node.js Projekte aufzubauen.

## 1. Projekt-Vorbereitung (Lokal)

### Secrets & Env
- **Keine Hardcoded Keys**: Alle Keys in `process.env` auslagern.
- **Dependencies**: `npm install dotenv`
- **Initialisierung**: `require('dotenv').config();` ganz oben in die `server.js`.
- **.gitignore**: `.env` und `logs/` hinzufügen.

### Docker Konfiguration
- **Dockerfile**:
  - Basis: `node:20-alpine`
  - Befehle: `npm install --production`, `COPY . .`, `EXPOSE 3000`.
- **docker-compose.yml**:
  - Port-Mapping (z.B. `8089:3000`).
  - `env_file: [.env]` nutzen.
  - Volume für Logs: `./logs:/app/logs`.

### Deployment Logik
- **deploy.sh**:
  - `git fetch origin main`, `git reset --hard origin/main`, `docker compose up -d --build`.
  - **Wichtig**: In Git als ausführbar markieren: `git update-index --chmod=+x deploy.sh`.

- **GitHub Actions (`.github/workflows/deploy.yml`)**:
  - Trigger: `push` auf `main`.
  - Runs-on: `[self-hosted, linux, docker-mailing-01]`.
  - Step: `run: bash /opt/projekt-name/deploy.sh`.

## 2. Server Setup (Docker Host)

### Verzeichnisse & Rechte
```bash
sudo mkdir -p /opt/projekt-name
sudo chown actions:actions /opt/projekt-name
sudo -u actions git clone https://github.com/user/repo.git /opt/projekt-name
sudo -u actions git config --global --add safe.directory /opt/projekt-name
chmod +x /opt/projekt-name/deploy.sh
```

### GitHub Runner
- User `actions` muss in Gruppe `docker` sein (`sudo usermod -aG docker actions`).
- Runner mit Labels registrieren (z.B. `docker-mailing-01`).
- Als Service starten (`./svc.sh install`, `./svc.sh start`).

## 3. Der KI-Prompt (Master Prompt)

Kopiere diesen Text für eine neue KI:

> "Ich möchte eine Docker CI/CD Pipeline für dieses Projekt aufbauen.
> 1. Verschiebe alle Secrets in Umgebungsvariablen mit `dotenv`.
> 2. Erstelle ein `Dockerfile` (Alpine) und ein `docker-compose.yml` (Port X:3000, .env Support).
> 3. Erstelle eine `deploy.sh` (git reset + docker rebuild). Markiere sie in Git als ausführbar (+x).
> 4. Erstelle einen GitHub Workflow für einen self-hosted Runner mit Label 'docker-mailing-01', der das Script via `bash` aufruft.
> 5. Gib mir die Befehle für die Server-Einrichtung (Ordner, Rechte, Runner-Registrierung)."
