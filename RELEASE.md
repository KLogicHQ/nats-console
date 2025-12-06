# Release Guide

This document describes how to release NATS Console Docker images, either manually or through GitHub Actions.

## Docker Images

The project produces the following Docker images:

| Image | Description | Dockerfile |
|-------|-------------|------------|
| `ghcr.io/klogichq/nats-console` | All-in-One (includes PostgreSQL, Redis, ClickHouse, NATS) | `Dockerfile` |
| `ghcr.io/klogichq/nats-console-api` | API service only | `apps/api/Dockerfile` |
| `ghcr.io/klogichq/nats-console-web` | Web frontend only | `apps/web/Dockerfile` |
| `ghcr.io/klogichq/nats-console-workers` | Background workers only | `apps/workers/Dockerfile` |

## Automated Release via GitHub Actions (Recommended)

The release workflow is triggered automatically when you push a version tag.

### Step 1: Prepare the Release

1. Ensure all changes are merged to `main`
2. Update the version in `package.json` if needed
3. Ensure CI passes on the main branch

### Step 2: Create and Push a Version Tag

```bash
# For a stable release
git tag v1.0.0
git push origin v1.0.0

# For a pre-release
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1

# For a release candidate
git tag v1.0.0-rc.1
git push origin v1.0.0-rc.1
```

### What Happens Automatically

When you push a tag matching `v*`, GitHub Actions will:

1. **Create a GitHub Release** with auto-generated changelog
2. **Build and push Docker images** for all services:
   - Multi-platform builds (linux/amd64, linux/arm64)
   - Multiple tags: `1.0.0`, `1.0`, `1`, `latest`
3. Pre-releases (`-alpha`, `-beta`, `-rc`) will NOT be tagged as `latest`

### Tag Format Examples

| Tag | Generated Image Tags |
|-----|---------------------|
| `v1.0.0` | `1.0.0`, `1.0`, `1`, `latest` |
| `v1.0.1` | `1.0.1`, `1.0`, `1`, `latest` |
| `v2.0.0-beta.1` | `2.0.0-beta.1` (no `latest`) |
| `v2.0.0-rc.1` | `2.0.0-rc.1` (no `latest`) |

## Manual Release

For manual Docker builds and pushes (useful for testing or hotfixes).

### Prerequisites

- Docker with Buildx enabled
- Access to GitHub Container Registry (ghcr.io)

### Step 1: Authenticate to GitHub Container Registry

```bash
# Create a Personal Access Token with `write:packages` scope
# Then login:
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

### Step 2: Build and Push Images

#### All-in-One Image

```bash
# Set version
VERSION=1.0.0

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/klogichq/nats-console:${VERSION} \
  --tag ghcr.io/klogichq/nats-console:latest \
  --push \
  --file Dockerfile \
  .
```

#### API Image

```bash
VERSION=1.0.0

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/klogichq/nats-console-api:${VERSION} \
  --tag ghcr.io/klogichq/nats-console-api:latest \
  --push \
  --file apps/api/Dockerfile \
  .
```

#### Web Image

```bash
VERSION=1.0.0

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/klogichq/nats-console-web:${VERSION} \
  --tag ghcr.io/klogichq/nats-console-web:latest \
  --push \
  --file apps/web/Dockerfile \
  .
```

#### Workers Image

```bash
VERSION=1.0.0

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/klogichq/nats-console-workers:${VERSION} \
  --tag ghcr.io/klogichq/nats-console-workers:latest \
  --push \
  --file apps/workers/Dockerfile \
  .
```

### Build All Images (Script)

```bash
#!/bin/bash
set -e

VERSION=${1:-"latest"}
REGISTRY="ghcr.io/klogichq"

echo "Building NATS Console images version: $VERSION"

# Build All-in-One
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ${REGISTRY}/nats-console:${VERSION} \
  --push \
  --file Dockerfile \
  .

# Build API
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ${REGISTRY}/nats-console-api:${VERSION} \
  --push \
  --file apps/api/Dockerfile \
  .

# Build Web
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ${REGISTRY}/nats-console-web:${VERSION} \
  --push \
  --file apps/web/Dockerfile \
  .

# Build Workers
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ${REGISTRY}/nats-console-workers:${VERSION} \
  --push \
  --file apps/workers/Dockerfile \
  .

echo "All images built and pushed successfully!"
```

## Local Build (Without Push)

For testing images locally without pushing to registry:

```bash
# Build All-in-One for local testing
docker build -t nats-console:local -f Dockerfile .

# Run locally
docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 4222:4222 \
  -v nats-console-data:/data \
  nats-console:local
```

## Versioning Guidelines

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (`x.0.0`): Breaking changes, incompatible API changes
- **MINOR** (`0.x.0`): New features, backwards compatible
- **PATCH** (`0.0.x`): Bug fixes, backwards compatible

### Pre-release Labels

- `alpha`: Early development, unstable
- `beta`: Feature complete, may have bugs
- `rc`: Release candidate, final testing

## Troubleshooting

### GitHub Actions Release Failed

1. Check the Actions tab for error logs
2. Verify the tag format matches `v*` pattern
3. Ensure `GITHUB_TOKEN` has `packages:write` permission

### Docker Buildx Not Available

```bash
# Enable buildx
docker buildx create --name builder --use
docker buildx inspect --bootstrap
```

### Authentication Failed

```bash
# Re-authenticate
docker logout ghcr.io
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

### Image Not Found After Push

- Wait a few minutes for the registry to propagate
- Check package visibility settings in GitHub repository settings
- Ensure the package is not set to private
