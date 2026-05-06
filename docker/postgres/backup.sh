#!/bin/bash
# PostgreSQL Backup Script

set -e

BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
echo "Starting PostgreSQL backup at $DATE"
pg_dump -h postgres -U postgres -d woosaas -Fc > "$BACKUP_DIR/woosaas_$DATE.dump"

# Compress backup
gzip "$BACKUP_DIR/woosaas_$DATE.dump"

# Upload to S3 (optional)
# aws s3 cp "$BACKUP_DIR/woosaas_$DATE.dump.gz" s3://woosaas-backups/postgres/

# Cleanup old backups
find $BACKUP_DIR -name "woosaas_*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: woosaas_$DATE.dump.gz"
echo "Retaining backups for $RETENTION_DAYS days"