# MITMproxy Troubleshooting Guide

Common issues and solutions when using MITMproxy integration with @asd/caddy-api-client.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Connection Issues](#connection-issues)
- [Traffic Not Captured](#traffic-not-captured)
- [Docker Networking](#docker-networking)
- [Performance Issues](#performance-issues)

---

## Installation Issues

### MITMproxy Docker Image Won't Start

**Symptoms:**

```bash
docker: Error response from daemon: failed to create shim task
```

**Solution:**

1. Check Docker is running: `docker ps`
2. Pull the image manually: `docker pull mitmproxy/mitmproxy:10.4.2`
3. Check for port conflicts: `lsof -i :8081` and `lsof -i :8082`

### Port Already in Use

**Symptoms:**

```bash
Error starting userland proxy: listen tcp4 0.0.0.0:8081: bind: address already in use
```

**Solution:**

1. Find process using the port: `lsof -i :8081`
2. Stop the process or use different ports:

```bash
docker run -d \
  -p 9081:8081 \  # Changed from 8081
  -p 9082:8080 \  # Changed from 8082
  ...
```

3. Update your code to use the new ports:

```typescript
const route = buildMitmproxyRoute({
  host: "api.example.com",
  mitmproxyHost: "localhost",
  mitmproxyPort: 9082, // Updated port
});
```

---

## Connection Issues

### "Connection Refused" When Accessing Web UI

**Symptoms:**

```
curl http://localhost:8081/
curl: (7) Failed to connect to localhost port 8081: Connection refused
```

**Solution:**

1. Check MITMproxy is running: `docker ps | grep mitmproxy`
2. Check container logs: `docker logs mitmproxy`
3. Verify healthcheck: `docker inspect mitmproxy | jq '.[0].State.Health'`

### Backend Not Reachable from MITMproxy

**Symptoms:**

- Requests timeout
- MITMproxy shows connection errors in logs
- Empty responses from Caddy

**Solution (Docker):**

If your backend is running on the host machine:

```bash
# Use host.docker.internal instead of localhost
docker run -d \
  --name mitmproxy \
  mitmproxy/mitmproxy:10.4.2 \
  mitmweb \
  --mode reverse:http://host.docker.internal:3000 \  # Not localhost:3000
  ...
```

If your backend is in Docker:

```bash
# Use container name or service name
docker run -d \
  --name mitmproxy \
  --network my-app-network \  # Same network as backend
  mitmproxy/mitmproxy:10.4.2 \
  mitmweb \
  --mode reverse:http://backend-service:3000 \  # Container name
  ...
```

---

## Traffic Not Captured

### Flows Endpoint Shows Empty Array

**Symptoms:**

```bash
curl http://localhost:8081/flows
[]
```

**Solutions:**

1. **Verify traffic is going through MITMproxy:**

```typescript
// Check the route is configured correctly
const routes = await client.getRoutes("https_server");
console.log(routes);
// Should show dial pointing to localhost:8082 (MITMproxy port)
```

2. **Check MITMproxy reverse proxy mode:**

```bash
docker logs mitmproxy
# Should show: Proxy server listening at http://0.0.0.0:8080
# Should show: Web server listening at http://0.0.0.0:8081
```

3. **Test MITMproxy directly:**

```bash
# Bypass Caddy and test MITMproxy directly
curl -v http://localhost:8082/test

# Check if flow was captured
curl http://localhost:8081/flows | jq 'length'
# Should show: 1 (or more)
```

4. **Verify Caddy route is active:**

```bash
# Make request through Caddy
curl -v http://localhost:8080/test -H "Host: api.example.com"

# Check Caddy logs
docker logs caddy
```

### Keep-Host-Header Issues

**Symptoms:**

- Backend receives wrong Host header
- Backend routing fails

**Solution:**
Add `--set keep_host_header=true` to MITMproxy command:

```bash
docker run -d \
  --name mitmproxy \
  mitmproxy/mitmproxy:10.4.2 \
  mitmweb \
  --mode reverse:http://backend:3000 \
  --set keep_host_header=true \  # Important!
  ...
```

---

## Docker Networking

### Caddy Can't Reach MITMproxy Container

**Symptoms:**

```typescript
// Route added successfully but requests fail
await client.addRoute("https_server", route);
// Later: Connection refused or timeout
```

**Solution:**

**Option 1: Use host networking (simple but less isolated)**

```bash
docker run -d \
  --network host \
  --name mitmproxy \
  mitmproxy/mitmproxy:10.4.2 \
  mitmweb --mode reverse:http://localhost:3000
```

```typescript
const route = buildMitmproxyRoute({
  host: "api.example.com",
  mitmproxyHost: "localhost", // Works with host networking
  mitmproxyPort: 8080,
});
```

**Option 2: Use Docker bridge network (recommended)**

```yaml
# docker-compose.yml
services:
  caddy:
    image: caddy:latest
    networks:
      - app-network
    ports:
      - "80:80"
      - "2019:2019"

  mitmproxy:
    image: mitmproxy/mitmproxy:10.4.2
    networks:
      - app-network
    command: >
      mitmweb
      --mode reverse:http://backend:3000
      --web-host 0.0.0.0
      --listen-host 0.0.0.0
      --set keep_host_header=true

  backend:
    image: your-backend
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

```typescript
const route = buildMitmproxyRoute({
  host: "api.example.com",
  mitmproxyHost: "mitmproxy", // Use container name
  mitmproxyPort: 8080,
});
```

### "No Such Host" Errors

**Symptoms:**

```
Error: dial tcp: lookup mitmproxy: no such host
```

**Solution:**
Ensure Caddy and MITMproxy are on the same Docker network:

```bash
# Check networks
docker inspect caddy | jq '.[0].NetworkSettings.Networks'
docker inspect mitmproxy | jq '.[0].NetworkSettings.Networks'

# Connect MITMproxy to Caddy's network
docker network connect caddy_network mitmproxy
```

---

## Performance Issues

### High Latency Through MITMproxy

**Symptoms:**

- Requests take significantly longer
- Timeout errors

**Solutions:**

1. **Disable web UI if not needed:**

```bash
# Use mitmdump instead of mitmweb (no web UI overhead)
docker run -d \
  --name mitmproxy \
  mitmproxy/mitmproxy:10.4.2 \
  mitmdump \
  --mode reverse:http://backend:3000 \
  --set keep_host_header=true
```

2. **Use direct routing for production traffic:**

```typescript
// Only route specific debug traffic through MITMproxy
const routes = buildMitmproxyRoutePair({
  host: "api.example.com",
  backendHost: "backend",
  backendPort: 3000,
  mitmproxyHost: "mitmproxy",
  routeId: "api_route",
});

// Default: Direct (fast)
await client.addRoute("https_server", routes.direct, routes.direct["@id"]);

// Only enable when debugging
// await client.removeRouteById("https_server", routes.direct["@id"]);
// await client.addRoute("https_server", routes.proxied, routes.proxied["@id"]);
```

3. **Increase resource limits:**

```yaml
# docker-compose.yml
services:
  mitmproxy:
    image: mitmproxy/mitmproxy:10.4.2
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
```

### Memory Usage Growing Over Time

**Symptoms:**

- MITMproxy container memory usage keeps increasing
- Eventually runs out of memory

**Solution:**

**Option 1: Clear flows periodically** (requires CSRF token)

```typescript
// Note: MITMproxy 10.4.2 requires CSRF token for POST /clear
// This is a security feature - manual clearing via Web UI is recommended
```

**Option 2: Restart MITMproxy periodically**

```bash
docker restart mitmproxy
```

**Option 3: Limit flow storage**

```bash
docker run -d \
  --name mitmproxy \
  mitmproxy/mitmproxy:10.4.2 \
  mitmweb \
  --mode reverse:http://backend:3000 \
  --set flow_detail=0 \  # Don't store request/response bodies
  --set keep_host_header=true
```

---

## Testing Issues

### Integration Tests Fail in CI

**Symptoms:**

```
SyntaxError: Unexpected end of JSON input
AssertionError: expected 0 to be greater than 0
```

**Root Cause:**
Tests are configured for Docker internal networking but running from host machine.

**Solution:**

**Option 1: Run tests inside Docker network**

```bash
# Run tests in a container on the same network
docker run --rm \
  --network caddy-network \
  -v $(pwd):/app \
  -w /app \
  node:20 \
  npm test
```

**Option 2: Use localhost for tests**

```typescript
// In test file
const BACKEND_HOST = process.env.CI ? "backend-test" : "localhost";
const MITMPROXY_HOST = process.env.CI ? "mitmproxy-test" : "localhost";

const route = buildHostRoute({
  host: testHost,
  dial: `${BACKEND_HOST}:5681`,
});
```

**Option 3: Configure test environment to match deployment**

```yaml
# docker-compose.test.yml
services:
  test-runner:
    image: node:20
    networks:
      - test-network
    volumes:
      - .:/app
    working_dir: /app
    command: npm test
    depends_on:
      - caddy
      - mitmproxy
      - backend-test

  caddy:
    networks:
      - test-network

  mitmproxy:
    networks:
      - test-network

  backend-test:
    networks:
      - test-network

networks:
  test-network:
    driver: bridge
```

---

## Additional Resources

- [MITMproxy Documentation](https://docs.mitmproxy.org/)
- [MITMproxy Reverse Proxy Mode](https://docs.mitmproxy.org/stable/concepts-modes/#reverse-proxy)
- [Caddy Admin API](https://caddyserver.com/docs/api)
- [Docker Networking](https://docs.docker.com/network/)

---

## Getting Help

If you encounter an issue not covered here:

1. Check MITMproxy logs: `docker logs mitmproxy`
2. Check Caddy logs: `docker logs caddy`
3. Verify network connectivity: `docker network inspect <network-name>`
4. Open an issue at: https://github.com/anthropics/asd-caddy-api-client/issues

Include:

- MITMproxy version
- Caddy version
- Docker version
- Relevant logs
- Minimal reproduction steps
