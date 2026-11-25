/**
 * Environment of every test process. Integration tests use TEST_DATABASE_URL
 * (default: the support_agent_test database of compose.dev.yaml).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://support_agent:support_agent@localhost:55436/support_agent_test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.APP_URL = "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.LOG_LEVEL = "silent";
process.env.OIDC_ISSUER ??= "http://localhost:8096/realms/support-agent";
process.env.OIDC_CLIENT_ID ??= "support-agent";
process.env.OIDC_CLIENT_SECRET ??= "test-client-secret";
process.env.ADMIN_EMAILS ??= "root@example.org";
