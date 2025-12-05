#!/bin/bash
set -e

echo "=============================================="
echo "  NATS Console - All-in-One Container"
echo "=============================================="
echo ""

# Initialize databases if needed
/init-databases.sh

# Start supervisord
exec "$@"
