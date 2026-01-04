# Post-Parity Roadmap

**Status**: ✅ Feature parity with Python achieved (2025-11-19)

This document outlines remaining tasks and enhancements for the TypeScript Caddy API client to progress as:

1. A critical component of the .asd CLI
2. A standalone npm package for programmatic Caddy management

---

## 🎯 P0 - Critical for .asd CLI (Immediate)

### 1. Package Publishing ⚠️ **BLOCKER**

**Why Critical**: Cannot be used in .asd CLI until published

**Tasks**:

- [ ] Finalize package.json metadata
  - Package name: `@accelerated-software-development/caddy-api-client`
  - Description, keywords, repository links
  - License verification (MIT)
- [ ] Set up npm publishing workflow
  - GitHub Actions for automated publishing
  - Semantic versioning strategy
  - Pre-release vs stable releases
- [ ] Publish v0.1.0 to npm registry
  - Beta/alpha release first for testing
  - Announce to .asd team

**Dependencies**: None
**Estimated Effort**: 4-6 hours
**Priority**: P0 - Must complete before .asd integration

---

### 2. .asd CLI Integration Documentation

**Why Critical**: .asd developers need clear integration guide

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

**Dependencies**: Package publishing
**Estimated Effort**: 8-10 hours
**Priority**: P0 - Critical for adoption

---

### 3. Error Recovery & Resilience

**Why Critical**: .asd CLI must handle Caddy failures gracefully

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

**Dependencies**: None
**Estimated Effort**: 12-16 hours
**Priority**: P0 - Production reliability

---

## 🔥 P1 - High Priority (Near-term)

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

**Dependencies**: None
**Estimated Effort**: 10-12 hours
**Priority**: P1 - Safety & debugging

---

### 5. Enhanced Certificate Management

**Why Important**: .asd services need advanced cert features

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

**Dependencies**: None
**Estimated Effort**: 16-20 hours
**Priority**: P1 - Production cert management

---

### 6. Logging & Observability

**Why Important**: .asd CLI needs visibility into Caddy operations

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

**Dependencies**: None
**Estimated Effort**: 12-14 hours
**Priority**: P1 - Debugging & monitoring

---

## 🚀 P2 - Medium Priority (Future)

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

**Dependencies**: None
**Estimated Effort**: 20-24 hours
**Priority**: P2 - Advanced use cases

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

**Dependencies**: Error recovery & resilience
**Estimated Effort**: 24-30 hours
**Priority**: P2 - Enterprise deployments

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

**Dependencies**: None
**Estimated Effort**: 16-20 hours
**Priority**: P2 - Security hardening

---

## 📦 P3 - Nice to Have (Optional)

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

**Estimated Effort**: 20-30 hours
**Priority**: P3 - Developer convenience

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

**Estimated Effort**: 8-12 hours
**Priority**: P3 - Performance at scale

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

**Estimated Effort**: 16-20 hours
**Priority**: P3 - Robustness

---

## 📊 Priority Summary

| Priority | Count   | Total Effort | Focus                               |
| -------- | ------- | ------------ | ----------------------------------- |
| **P0**   | 3 tasks | 24-32 hours  | .asd CLI integration & publishing   |
| **P1**   | 3 tasks | 50-62 hours  | Production reliability & monitoring |
| **P2**   | 3 tasks | 60-74 hours  | Advanced features                   |
| **P3**   | 3 tasks | 44-62 hours  | Polish & optimization               |

**Total Remaining**: ~178-230 hours of work

---

## 🎯 Recommended Next Steps

### Immediate (Next 2 weeks)

1. ✅ **Package Publishing** - Unblock .asd CLI integration
2. ✅ **Integration Docs** - Enable .asd team to use the package
3. ✅ **Retry Logic** - Production stability

### Short-term (Next month)

4. Config validation & safety features
5. Enhanced certificate management
6. Logging & observability

### Long-term (Next quarter)

7. Advanced routing features
8. Security enhancements
9. Developer experience improvements

---

## 📈 Current State

### ✅ Completed (Feature Parity)

- All core domain management (add, update, delete)
- Certificate rotation with zero-downtime
- Redirect modes (www ↔ domain, configurable status codes)
- Security headers (HSTS, X-Frame-Options, etc.)
- HTTP Basic Authentication
- Path rewriting
- Load balancing
- Compression (gzip, zstd, brotli)
- TLS connection policies
- Route ordering system
- High-level helper functions
- 294 unit tests + 51 integration tests
- > 95% code coverage

### ❌ Not Yet Implemented

- Package publishing to npm
- .asd CLI integration documentation
- Retry logic & error recovery
- Config validation & dry-run
- `load_pem` certificate support
- Structured logging
- Advanced routing (rate limiting, caching)
- Multi-instance management
- Advanced security (CSP, mTLS, IP filtering)

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

- [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) - Historical feature implementation
- [python-api-parity.md](python-api-parity.md) - Python comparison
- [REFACTOR_PROGRESS.md](REFACTOR_PROGRESS.md) - Architecture improvements
- [../wiki/TESTING_STRATEGY.md](../wiki/TESTING_STRATEGY.md) - Testing philosophy
