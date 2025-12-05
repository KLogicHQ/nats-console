#!/bin/bash
set -e

echo "[Init] Starting database initialization..."

# =============================================================================
# Data directory structure
# =============================================================================
# /data
# ├── postgres/
# ├── redis/
# ├── clickhouse/
# ├── nats/
# └── logs/
# =============================================================================

DATA_DIR="/data"
POSTGRES_DATA="$DATA_DIR/postgres"
REDIS_DATA="$DATA_DIR/redis"
CLICKHOUSE_DATA="$DATA_DIR/clickhouse"
NATS_DATA="$DATA_DIR/nats"
LOGS_DIR="$DATA_DIR/logs"

# Create directory structure
create_directories() {
    echo "[Init] Creating data directory structure..."
    mkdir -p "$POSTGRES_DATA" "$REDIS_DATA" "$CLICKHOUSE_DATA" "$NATS_DATA" "$LOGS_DIR"

    # Set ownership
    chown -R postgres:postgres "$POSTGRES_DATA"
    chown -R redis:redis "$REDIS_DATA"
    chown -R clickhouse:clickhouse "$CLICKHOUSE_DATA"

    # Create symlinks from default locations to /data
    rm -rf /var/lib/postgresql/data
    rm -rf /var/lib/redis
    rm -rf /var/lib/clickhouse
    rm -rf /var/lib/nats
    rm -rf /var/log/nats-console

    ln -sf "$POSTGRES_DATA" /var/lib/postgresql/data
    ln -sf "$REDIS_DATA" /var/lib/redis
    ln -sf "$CLICKHOUSE_DATA" /var/lib/clickhouse
    ln -sf "$NATS_DATA" /var/lib/nats
    ln -sf "$LOGS_DIR" /var/log/nats-console

    echo "[Init] Directory structure created."
}

# =============================================================================
# Initialize PostgreSQL
# =============================================================================
init_postgres() {
    echo "[PostgreSQL] Initializing..."

    # Check if data directory is empty
    if [ ! -f "$POSTGRES_DATA/PG_VERSION" ]; then
        echo "[PostgreSQL] Creating new database cluster..."
        chown -R postgres:postgres "$POSTGRES_DATA"
        su - postgres -c "/usr/lib/postgresql/16/bin/initdb -D $POSTGRES_DATA"

        # Configure PostgreSQL for local connections
        echo "host all all 0.0.0.0/0 md5" >> "$POSTGRES_DATA/pg_hba.conf"
        echo "listen_addresses = '*'" >> "$POSTGRES_DATA/postgresql.conf"
    fi

    # Start PostgreSQL temporarily
    su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $POSTGRES_DATA -w start"

    # Create database and user
    su - postgres -c "psql -c \"SELECT 1 FROM pg_user WHERE usename = 'nats_console'\" | grep -q 1" || \
        su - postgres -c "psql -c \"CREATE USER nats_console WITH PASSWORD 'nats_console';\""

    su - postgres -c "psql -c \"SELECT 1 FROM pg_database WHERE datname = 'nats_console'\" | grep -q 1" || \
        su - postgres -c "psql -c \"CREATE DATABASE nats_console OWNER nats_console;\""

    # Grant privileges
    su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE nats_console TO nats_console;\""

    echo "[PostgreSQL] Running Prisma migrations..."
    cd /app/apps/api && DATABASE_URL="postgresql://nats_console:nats_console@localhost:5432/nats_console" npx prisma migrate deploy || true

    # Stop PostgreSQL (will be started by supervisord)
    su - postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $POSTGRES_DATA -w stop"

    echo "[PostgreSQL] Initialization complete."
}

# =============================================================================
# Initialize ClickHouse
# =============================================================================
init_clickhouse() {
    echo "[ClickHouse] Initializing..."

    # Ensure ClickHouse directories exist
    mkdir -p "$CLICKHOUSE_DATA"
    chown -R clickhouse:clickhouse "$CLICKHOUSE_DATA"

    # Start ClickHouse temporarily
    sudo -u clickhouse /usr/bin/clickhouse-server --config-file=/etc/clickhouse-server/config.xml --daemon
    sleep 5

    # Wait for ClickHouse to be ready
    for i in {1..30}; do
        if clickhouse-client --query "SELECT 1" &>/dev/null; then
            break
        fi
        echo "[ClickHouse] Waiting for server to start... ($i/30)"
        sleep 1
    done

    # Create database
    clickhouse-client --query "CREATE DATABASE IF NOT EXISTS nats_console"

    # Run schema initialization
    if [ -f /docker-entrypoint-initdb.d/clickhouse-init.sql ]; then
        echo "[ClickHouse] Running schema initialization..."
        clickhouse-client --database nats_console --multiquery < /docker-entrypoint-initdb.d/clickhouse-init.sql
    fi

    # Stop ClickHouse (will be started by supervisord)
    pkill -f clickhouse-server || true
    sleep 2

    echo "[ClickHouse] Initialization complete."
}

# =============================================================================
# Main initialization
# =============================================================================
main() {
    # Create directory structure
    create_directories

    # Initialize PostgreSQL
    init_postgres

    # Initialize ClickHouse
    init_clickhouse

    echo "[Init] All databases initialized successfully!"
    echo ""
    echo "Data stored in: $DATA_DIR"
    echo "  ├── postgres/   - PostgreSQL data"
    echo "  ├── redis/      - Redis data"
    echo "  ├── clickhouse/ - ClickHouse data"
    echo "  ├── nats/       - NATS JetStream data"
    echo "  └── logs/       - Application logs"
    echo ""
}

# Only run if not already initialized
if [ ! -f "$DATA_DIR/.initialized" ]; then
    main
    touch "$DATA_DIR/.initialized"
else
    echo "[Init] Databases already initialized, ensuring symlinks..."
    create_directories
fi
