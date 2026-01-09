#!/bin/bash
# Generate TypeScript types and Zod schemas from Caddy Go source
set -e

SCRIPT_DIR="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(/usr/bin/dirname "$SCRIPT_DIR")"
GENERATED_DIR="$PROJECT_ROOT/src/generated"
CADDY_DIR="$PROJECT_ROOT/local/caddy"

echo "=== Caddy Type Generation Pipeline ==="
echo "Project root: $PROJECT_ROOT"
echo "Caddy source: $CADDY_DIR"
echo "Output dir: $GENERATED_DIR"
echo ""

# Ensure output directory exists
mkdir -p "$GENERATED_DIR"

# Step 1: Generate TypeScript from Go using tygo
echo "Step 1: Generating TypeScript types from Go source..."
cd "$CADDY_DIR"
tygo generate
cd "$PROJECT_ROOT"

# Step 2: Post-process TypeScript to fix Caddy-specific patterns
echo "Step 2: Post-processing TypeScript for Caddy-specific patterns..."
npx tsx "$SCRIPT_DIR/transform-caddy-types.ts"

# Step 3: Generate Zod schemas from TypeScript
echo "Step 3: Generating Zod schemas from TypeScript..."
cd "$PROJECT_ROOT"
npx ts-to-zod src/generated/caddy-core.ts src/generated/caddy-core.zod.ts --skipValidation
npx ts-to-zod src/generated/caddy-http.ts src/generated/caddy-http.zod.ts --skipValidation
npx ts-to-zod src/generated/caddy-tls.ts src/generated/caddy-tls.zod.ts --skipValidation

# Step 4: Create barrel exports
echo "Step 4: Creating barrel exports..."
cat > "$GENERATED_DIR/index.ts" << 'EOF'
// Auto-generated barrel exports for Caddy types
// Generated from local/caddy Go source

// Core types (caddy package)
export * from "./caddy-core";

// HTTP types (caddyhttp package) - rename conflicting types
export {
  // Re-export all HTTP types
  type App as HttpApp,
  type Server,
  type Route,
  type RouteList,
  type MatcherSet,
  type RawMatcherSets,
  type MatcherSets,
  type AutoHTTPSConfig,
  type RequestMatcher,
  type RequestMatcherWithError,
  type Handler,
  type HandlerError,
  type MiddlewareHandler,
  type Metrics,
  type HTTPErrorConfig,
  type ServerLogConfig,
  type VarsMiddleware,
  type VarsMatcher,
  type StaticError,
  type StaticResponse,
  type Invoke,
  type ResponseHandler,
  type WeightedResponseHandler,
  type ResponseMatcher,
  type MatchExpression,
  type CELLibraryProducer,
  type MatchPath,
  type MatchPathRE,
  type MatchMethod,
  type MatchQuery,
  type MatchHeader,
  type MatchHeaderRE,
  type MatchProtocol,
  type MatchNot,
  type MatchRemoteIP as HttpMatchRemoteIP,
  type MatchClientIP,
  type MatchLocalIP,
  type MatchRegexp as HttpMatchRegexp,
  type MatchVarsRE,
  type MatchHost,
  type MatchFile,
  type MatcherErrorVars,
  type CELMatcherFactory,
  type CELMatcher,
  type Subroute,
  type Rewrite,
  type RequestBody,
  type Tracing,
  type AcmeServer,
  type Encode,
  type Precompressed,
  type Push,
  type FileServer,
  type TemplateContext,
  type Templates,
} from "./caddy-http";

// TLS types (caddytls package) - rename conflicting types
export {
  type TLS,
  type AutomationConfig,
  type AutomationPolicy,
  type OnDemandConfig,
  type RateLimit,
  type OCSPConfig,
  type ConnectionPolicy,
  type ClientAuthentication,
  type PublicKeyAlgorithm,
  type CertSelectionPolicy,
  type CertCacheOptions,
  type MatchRemoteIP as TlsMatchRemoteIP,
  type MatchLocalIP as TlsMatchLocalIP,
  type CertificateLoader,
  type CustomCertSelectionPolicy,
  type Permission,
  type Distributed,
  type ACMEIssuer,
  type ExternalAccountBinding,
  type ChainPreference,
  type HTTPChallengeConfig,
  type TLSALPNChallengeConfig,
  type DNSChallengeConfig,
  type DNSProviderMaker,
  type InternalIssuer,
  type MatchRegexp as TlsMatchRegexp,
  type MatchServerName,
  type SessionTicketService,
  type STSRotation,
  type CertificatesLoaderPEM,
  type CertificatesLoaderPEMFile,
  type CAPool,
  type TrustedClientCertificateOrigin,
  type StorageLoader,
  type FolderLoader,
  type ZeroSSLIssuer,
} from "./caddy-tls";

// Zod schemas - Core
export * from "./caddy-core.zod";

// Zod schemas - HTTP (rename conflicting schemas)
export {
  appSchema as httpAppSchema,
  matchRegexpSchema as httpMatchRegexpSchema,
  matchRemoteIpSchema as httpMatchRemoteIpSchema,
  serverSchema,
  routeSchema,
  routeListSchema,
  autoHttpsConfigSchema,
  metricsSchema,
  httpErrorConfigSchema,
  serverLogConfigSchema,
  staticErrorSchema,
  staticResponseSchema,
  invokeSchema,
  responseHandlerSchema,
  weightedResponseHandlerSchema,
  responseMatcherSchema,
  matchExpressionSchema,
  matchPathSchema,
  matchPathReSchema,
  matchMethodSchema,
  matchQuerySchema,
  matchHeaderSchema,
  matchHeaderReSchema,
  matchProtocolSchema,
  matchNotSchema,
  matchClientIpSchema,
  matchLocalIpSchema,
  matchVarsReSchema,
  matchHostSchema,
  matchFileSchema,
  subrouteSchema,
  rewriteSchema,
  requestBodySchema,
  tracingSchema,
  encodeSchema,
  precompressedSchema,
  pushSchema,
  fileServerSchema,
  templateContextSchema,
  templatesSchema,
} from "./caddy-http.zod";

// Zod schemas - TLS (rename conflicting schemas)
export {
  tlsSchema,
  automationConfigSchema,
  automationPolicySchema,
  onDemandConfigSchema,
  rateLimitSchema,
  ocspConfigSchema,
  connectionPolicySchema,
  clientAuthenticationSchema,
  publicKeyAlgorithmSchema,
  certSelectionPolicySchema,
  certCacheOptionsSchema,
  matchRemoteIpSchema as tlsMatchRemoteIpSchema,
  matchLocalIpSchema as tlsMatchLocalIpSchema,
  certificateLoaderSchema,
  customCertSelectionPolicySchema,
  permissionSchema,
  distributedSchema,
  acmeIssuerSchema,
  externalAccountBindingSchema,
  chainPreferenceSchema,
  httpChallengeConfigSchema,
  tlsalpnChallengeConfigSchema,
  dnsChallengeConfigSchema,
  dnsProviderMakerSchema,
  internalIssuerSchema,
  matchRegexpSchema as tlsMatchRegexpSchema,
  matchServerNameSchema,
  sessionTicketServiceSchema,
  stsRotationSchema,
  certificatesLoaderPemSchema,
  certificatesLoaderPemFileSchema,
  caPoolSchema,
  trustedClientCertificateOriginSchema,
  storageLoaderSchema,
  folderLoaderSchema,
  zeroSslIssuerSchema,
} from "./caddy-tls.zod";
EOF

echo ""
echo "=== Generation Complete ==="
echo "Generated files:"
ls -la "$GENERATED_DIR"/*.ts | awk '{print "  " $NF " (" $5 " bytes)"}'

# Count types
CORE_TYPES=$(grep -c "^export interface\|^export type" "$GENERATED_DIR/caddy-core.ts" || echo 0)
HTTP_TYPES=$(grep -c "^export interface\|^export type" "$GENERATED_DIR/caddy-http.ts" || echo 0)
TLS_TYPES=$(grep -c "^export interface\|^export type" "$GENERATED_DIR/caddy-tls.ts" || echo 0)
TOTAL_TYPES=$((CORE_TYPES + HTTP_TYPES + TLS_TYPES))

echo ""
echo "Type count:"
echo "  Core: $CORE_TYPES types"
echo "  HTTP: $HTTP_TYPES types"
echo "  TLS:  $TLS_TYPES types"
echo "  Total: $TOTAL_TYPES types"
