#!/bin/bash
# Script to reset history on production (smtpsend)

CONTAINER_NAME="smtpsend-app"
DATE=$(date +%Y-%m-%d_%H-%M)

echo "Starting history reset for $CONTAINER_NAME..."

# Check if container is running
if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo ">> Renaming sent_history.csv..."
    docker exec $CONTAINER_NAME mv sent_history.csv sent_history_backup_$DATE.csv 2>/dev/null || echo "   (sent_history.csv not found)"
    
    echo ">> Renaming processed_emails.txt..."
    docker exec $CONTAINER_NAME mv processed_emails.txt processed_emails_backup_$DATE.txt 2>/dev/null || echo "   (processed_emails.txt not found)"
    
    echo ">> Reset complete. The server will start a new history file on the next send."
else
    echo "Error: Container $CONTAINER_NAME is not running."
    echo "Please ensure the app is started before running this script."
fi
