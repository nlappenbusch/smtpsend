#!/bin/bash
set -e

REPO_DIR="/opt/smtpsend"
cd "$REPO_DIR"

echo "=== SmtpSend Deploy ==="
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting deployment..."

# Pull latest changes
echo ">> Fetching latest code..."
git fetch origin main
git reset --hard origin/main

# Build and restart container
echo ">> Building and restarting container..."
docker compose up -d --build --remove-orphans

# Cleanup old images
echo ">> Cleaning up old images..."
docker image prune -f

echo "$(date '+%Y-%m-%d %H:%M:%S') - Deployment complete!"
echo ">> App running on port 8089"
