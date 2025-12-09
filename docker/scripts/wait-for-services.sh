#!/bin/bash
# Wait for required services to be ready before starting the application

set -e

MAX_RETRIES=60
RETRY_INTERVAL=2

wait_for_postgres() {
    echo "[Wait] Checking PostgreSQL..."
    for i in $(seq 1 $MAX_RETRIES); do
        if pg_isready -h localhost -p 5432 -U nats_console -q 2>/dev/null; then
            echo "[Wait] PostgreSQL is ready."
            return 0
        fi
        echo "[Wait] PostgreSQL not ready, retrying... ($i/$MAX_RETRIES)"
        sleep $RETRY_INTERVAL
    done
    echo "[Wait] ERROR: PostgreSQL failed to start."
    return 1
}

wait_for_redis() {
    echo "[Wait] Checking Redis..."
    for i in $(seq 1 $MAX_RETRIES); do
        if redis-cli -h localhost -p 6379 ping 2>/dev/null | grep -q PONG; then
            echo "[Wait] Redis is ready."
            return 0
        fi
        echo "[Wait] Redis not ready, retrying... ($i/$MAX_RETRIES)"
        sleep $RETRY_INTERVAL
    done
    echo "[Wait] ERROR: Redis failed to start."
    return 1
}

wait_for_clickhouse() {
    echo "[Wait] Checking ClickHouse..."
    for i in $(seq 1 $MAX_RETRIES); do
        if curl -s http://localhost:8123/ping 2>/dev/null | grep -q "Ok"; then
            echo "[Wait] ClickHouse is ready."
            return 0
        fi
        echo "[Wait] ClickHouse not ready, retrying... ($i/$MAX_RETRIES)"
        sleep $RETRY_INTERVAL
    done
    echo "[Wait] ERROR: ClickHouse failed to start."
    return 1
}

wait_for_nats() {
    echo "[Wait] Checking NATS..."
    for i in $(seq 1 $MAX_RETRIES); do
        if curl -s http://localhost:8222/healthz 2>/dev/null | grep -q "ok"; then
            echo "[Wait] NATS is ready."
            return 0
        fi
        echo "[Wait] NATS not ready, retrying... ($i/$MAX_RETRIES)"
        sleep $RETRY_INTERVAL
    done
    echo "[Wait] ERROR: NATS failed to start."
    return 1
}

# Main
echo "[Wait] Waiting for all services to be ready..."

wait_for_postgres
wait_for_redis
wait_for_clickhouse
wait_for_nats

echo "[Wait] All services are ready!"

# Execute the passed command
exec "$@"
