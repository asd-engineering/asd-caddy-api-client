# Roadmap

**Status**: ✅ Feature parity with Python achieved (2025-11-19)

This document outlines future enhancements for the TypeScript Caddy API client.

For completed features, see [CHANGELOG.md](../../CHANGELOG.md).

---

## 🎯 P0 - Critical

### 1. Package Publishing

**Why Critical**: Required for .asd CLI integration

**Tasks**:

- [x] Finalize package.json metadata
  - Package name: `@accelerated-software-development/caddy-api-client`
  - Description, keywords, repository links
  - License verification (MIT)
- [x] Set up npm publishing workflow
  - GitHub Actions for automated publishing
  - Semantic versioning strategy
  - Pre-release vs stable releases
- [x] Publish to npm registry
  - Announce to Accelerated Software Development B.V. team

---

### 2. .asd CLI Integration Documentation

**Why Critical**: Developers need clear integration guide

**Tasks**:

- [ ] Create integration guide for .asd CLI
  - Installation instructions
  - Basic usage examples
  - Error handling patterns
  - TypeScript type integration
- [ ] Document .asd-specific patterns
  - Service registration workflow
  - Multi-domain management
  - Health check integration
  - Certificate rotation for .asd services
- [ ] Create migration guide (if replacing existing code)
- [ ] Add .asd CLI usage examples

---

### 3. Error Recovery & Resilience

**Why Critical**: Production deployments must handle Caddy failures gracefully

**Tasks**:

- [ ] Retry logic with exponential backoff
  - Configurable retry attempts
  - Exponential backoff strategy
  - Circuit breaker pattern
- [ ] Caddy health checking
  - Verify Caddy is running before operations
  - Auto-recovery suggestions
- [ ] Rollback on failure
  - Snapshot config before changes
  - Automatic rollback on errors
  - Manual rollback API
- [ ] Connection timeout handling
  - Configurable timeouts
  - Clear error messages

---

## 🔥 P1 - High Priority

### 4. Config Validation & Testing

**Why Important**: Prevent invalid configs from reaching Caddy

**Tasks**:

- [ ] Pre-flight config validation
  - JSON schema validation
  - Port conflict detection
  - Certificate path verification
- [ ] Config diffing
  - Show what will change before applying
  - Safety prompts for destructive changes
- [ ] Dry-run mode
  - Test configs without applying
  - Validation-only mode
- [ ] Config snapshots
  - Save before each change
  - Easy restore functionality

---

### 5. Enhanced Certificate Management

**Why Important**: Advanced cert features for production services

**Tasks**:

- [ ] `load_pem` support (inline certificates)
  - Match Python API exactly
  - Easier testing with mock certs
  - Secrets management integration
- [ ] Wildcard certificate detection
  - Auto-detect wildcard certs
  - Multi-domain certificate handling
  - SAN (Subject Alternative Names) parsing
- [ ] Certificate renewal automation
  - Monitor expiration dates
  - Trigger renewal workflows
  - Integration hooks for Let's Encrypt
- [ ] Certificate health monitoring
  - Webhook notifications for expiring certs
  - Dashboard integration

---

### 6. Logging & Observability

**Why Important**: Visibility into Caddy operations

**Tasks**:

- [ ] Structured logging
  - JSON log output option
  - Configurable log levels
  - Request/response logging (sanitized)
- [ ] Metrics collection
  - Request latency tracking
  - Error rate monitoring
  - Config change tracking
- [ ] Debug mode
  - Verbose output for troubleshooting
  - cURL command equivalents
  - Request/response dumps
- [ ] Audit trail
  - Log all config changes
  - Who/what/when tracking

---

## 🚀 P2 - Medium Priority

### 7. Advanced Routing Features

**Why Useful**: Power users and complex deployments

**Tasks**:

- [ ] Request matching enhancements
  - Query parameter matching
  - Header-based routing
  - Method-based routing (already in types, needs helpers)
- [ ] Response modification
  - Response header manipulation
  - Status code overrides
  - Body transformation helpers
- [ ] Rate limiting helpers
  - Per-route rate limits
  - IP-based limiting
  - Custom rate limit rules
- [ ] Caching configuration
  - Cache control headers
  - Cache key customization

---

### 8. Multi-Caddy Instance Management

**Why Useful**: Large deployments with multiple Caddy instances

**Tasks**:

- [ ] Multi-instance client
  - Manage multiple Caddy instances
  - Load balancing across instances
  - Failover support
- [ ] Cluster coordination
  - Sync configs across instances
  - Leader election
  - Split-brain prevention
- [ ] Health checking across cluster
  - Instance health monitoring
  - Auto-remove unhealthy instances

---

### 9. Advanced Security Features

**Why Useful**: Security-conscious deployments

**Tasks**:

- [ ] Advanced security headers
  - Content Security Policy (CSP) builder
  - Permissions-Policy support
  - Referrer-Policy helpers
- [ ] mTLS (mutual TLS) support
  - Client certificate authentication
  - CA bundle management
  - Certificate validation rules
- [ ] IP allowlist/blocklist
  - Per-route IP filtering
  - CIDR range support
  - Dynamic IP list updates
- [ ] API key authentication
  - Header-based auth
  - API key rotation
  - Multi-key support

---

## 📦 P3 - Nice to Have

### 10. Developer Experience Enhancements

**Tasks**:

- [ ] Interactive CLI mode
  - REPL for testing Caddy configs
  - Tab completion
  - Command history
- [ ] Config visualization
  - Graphical route visualization
  - ASCII art route trees
  - Config diff visualization
- [ ] Template system
  - Reusable config templates
  - Variable substitution
  - Template library
- [ ] Migration helpers
  - Import from other reverse proxies (nginx, traefik)
  - Export to other formats

---

### 11. Performance Optimization

**Tasks**:

- [ ] Connection pooling
  - Reuse HTTP connections to Caddy
  - Configurable pool size
- [ ] Batch operations
  - Multiple config changes in one request
  - Atomic multi-section updates
- [ ] Caching
  - Cache getConfig() results
  - Invalidation strategies
  - TTL configuration

---

### 12. Testing & Quality Improvements

**Tasks**:

- [ ] Contract testing with Python client
  - Ensure identical behavior
  - Shared test suite
- [ ] Chaos engineering tests
  - Network failure scenarios
  - Caddy crash recovery
  - Partial failure handling
- [ ] Load testing
  - High-frequency config changes
  - Large configuration handling
  - Memory leak detection
- [ ] Fuzzing
  - Invalid input handling
  - Edge case discovery

---

## 📝 Notes

- **Breaking Changes**: Avoid breaking changes in v0.x series
- **Versioning**: Follow semantic versioning strictly
- **Deprecation**: Mark features as deprecated before removing (1 major version notice)
- **Documentation**: Update docs with every feature addition
- **Testing**: Maintain >90% test coverage target
- **Python Parity**: Continue monitoring Python client for new features

---

## 🔗 Related Documents

- [CHANGELOG.md](../../CHANGELOG.md) - Version history and completed features
- [python-api-parity.md](python-api-parity.md) - Python comparison
