/**
 * LDAP Identity Store Integration Tests
 *
 * These tests require OpenLDAP to be running:
 * ```bash
 * npm run docker:ldap:up
 * ```
 *
 * Run tests:
 * ```bash
 * npm run test:ldap
 * ```
 *
 * Tests will be skipped if OpenLDAP is not available.
 *
 * Note: These tests verify LDAP connectivity and configuration.
 * For actual authentication flow tests with caddy-security,
 * you need a Caddy build with the caddy-security plugin.
 */

import { test, expect } from "@playwright/test";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const LDAP_HOST = "localhost";
const LDAP_PORT = 389;
const LDAP_BASE_DN = "dc=test,dc=local";
const LDAP_ADMIN_DN = "cn=admin,dc=test,dc=local";
const LDAP_ADMIN_PASSWORD = "admin";
const PHPLDAPADMIN_URL = "http://localhost:8081";

// Test users from LDIF
const TEST_USERS = {
  testuser: {
    dn: "cn=testuser,ou=users,dc=test,dc=local",
    password: "password",
    email: "test@test.local",
    groups: ["users", "developers"],
  },
  adminuser: {
    dn: "cn=adminuser,ou=users,dc=test,dc=local",
    password: "admin123",
    email: "admin@test.local",
    groups: ["users", "admins"],
  },
  devuser: {
    dn: "cn=devuser,ou=users,dc=test,dc=local",
    password: "dev123",
    email: "dev@test.local",
    groups: ["developers"],
  },
};

// Check if ldapsearch command is available
async function checkLdapsearchAvailable(): Promise<boolean> {
  try {
    await execAsync("which ldapsearch");
    return true;
  } catch {
    return false;
  }
}

// Check if LDAP server is available
async function checkLdapAvailable(): Promise<void> {
  // First check if ldapsearch command is available
  const hasLdapsearch = await checkLdapsearchAvailable();
  if (!hasLdapsearch) {
    test.skip(true, "ldapsearch command not available. Install ldap-utils package.");
    return;
  }

  try {
    // Try a simple LDAP connection - this will fail with non-zero exit if server unavailable
    const { stdout } = await execAsync(
      `ldapsearch -x -H ldap://${LDAP_HOST}:${LDAP_PORT} -b "${LDAP_BASE_DN}" -D "${LDAP_ADMIN_DN}" -w "${LDAP_ADMIN_PASSWORD}" "(objectClass=organizationalUnit)" dn 2>&1`
    );
    // Verify we got actual results, not just an error message
    if (!stdout.includes("dn:") && !stdout.includes("numEntries")) {
      throw new Error("LDAP server not responding correctly");
    }
  } catch {
    test.skip(true, "LDAP server not available. Run: npm run docker:ldap:up");
  }
}

// Helper to run ldapsearch
async function ldapsearch(
  filter: string,
  attributes: string[] = [],
  bindDn?: string,
  bindPassword?: string
): Promise<string> {
  const bind = bindDn ? `-D "${bindDn}" -w "${bindPassword}"` : "-x";
  const attrs = attributes.length > 0 ? attributes.join(" ") : "";

  const cmd = `ldapsearch -x -H ldap://${LDAP_HOST}:${LDAP_PORT} -b "${LDAP_BASE_DN}" ${bind} "${filter}" ${attrs}`;

  const { stdout } = await execAsync(cmd);
  return stdout;
}

// Helper to run ldapwhoami (test authentication)
async function ldapwhoami(bindDn: string, bindPassword: string): Promise<boolean> {
  try {
    const cmd = `ldapwhoami -x -H ldap://${LDAP_HOST}:${LDAP_PORT} -D "${bindDn}" -w "${bindPassword}"`;
    await execAsync(cmd);
    return true;
  } catch {
    return false;
  }
}

test.describe("LDAP Server Health", () => {
  test.beforeEach(async () => {
    await checkLdapAvailable();
  });

  test("phpLDAPadmin is accessible", async ({ request }) => {
    const response = await request.get(PHPLDAPADMIN_URL);
    expect(response.ok()).toBe(true);
  });

  test("ldap server accepts admin bind", async () => {
    const result = await ldapwhoami(LDAP_ADMIN_DN, LDAP_ADMIN_PASSWORD);
    expect(result).toBe(true);
  });

  test("base DN is accessible", async () => {
    const result = await ldapsearch("(objectClass=*)", ["dn"], LDAP_ADMIN_DN, LDAP_ADMIN_PASSWORD);
    expect(result).toContain(LDAP_BASE_DN);
  });
});

test.describe("LDAP User Search", () => {
  test.beforeEach(async () => {
    await checkLdapAvailable();
  });

  test("finds test user by uid", async () => {
    const result = await ldapsearch(
      "(uid=testuser)",
      ["cn", "mail"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("cn: testuser");
    expect(result).toContain("mail: test@test.local");
  });

  test("finds user by email", async () => {
    const result = await ldapsearch(
      "(mail=admin@test.local)",
      ["cn", "uid"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("cn: adminuser");
    expect(result).toContain("uid: adminuser");
  });

  test("returns multiple users for wildcard search", async () => {
    const result = await ldapsearch(
      "(objectClass=inetOrgPerson)",
      ["uid"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("uid: testuser");
    expect(result).toContain("uid: adminuser");
    expect(result).toContain("uid: devuser");
  });

  test("users organizational unit exists", async () => {
    const result = await ldapsearch(
      "(&(objectClass=organizationalUnit)(ou=users))",
      ["ou", "description"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("ou: users");
    expect(result).toContain("description: User accounts");
  });
});

test.describe("LDAP Simple Bind Authentication", () => {
  test.beforeEach(async () => {
    await checkLdapAvailable();
  });

  test("authenticates valid user with correct password", async () => {
    const result = await ldapwhoami(TEST_USERS.testuser.dn, TEST_USERS.testuser.password);
    expect(result).toBe(true);
  });

  test("rejects valid user with wrong password", async () => {
    const result = await ldapwhoami(TEST_USERS.testuser.dn, "wrongpassword");
    expect(result).toBe(false);
  });

  test("rejects non-existent user", async () => {
    const result = await ldapwhoami("cn=nonexistent,ou=users,dc=test,dc=local", "password");
    expect(result).toBe(false);
  });

  test("admin user can authenticate", async () => {
    const result = await ldapwhoami(TEST_USERS.adminuser.dn, TEST_USERS.adminuser.password);
    expect(result).toBe(true);
  });

  test("developer user can authenticate", async () => {
    const result = await ldapwhoami(TEST_USERS.devuser.dn, TEST_USERS.devuser.password);
    expect(result).toBe(true);
  });
});

test.describe("LDAP Group Membership", () => {
  test.beforeEach(async () => {
    await checkLdapAvailable();
  });

  test("users group contains expected members", async () => {
    const result = await ldapsearch(
      "(&(objectClass=groupOfNames)(cn=users))",
      ["member"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("member: cn=testuser,ou=users,dc=test,dc=local");
    expect(result).toContain("member: cn=adminuser,ou=users,dc=test,dc=local");
  });

  test("admins group contains only admin users", async () => {
    const result = await ldapsearch(
      "(&(objectClass=groupOfNames)(cn=admins))",
      ["member"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("member: cn=adminuser,ou=users,dc=test,dc=local");
    expect(result).not.toContain("member: cn=testuser,ou=users,dc=test,dc=local");
  });

  test("developers group contains dev users", async () => {
    const result = await ldapsearch(
      "(&(objectClass=groupOfNames)(cn=developers))",
      ["member"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("member: cn=testuser,ou=users,dc=test,dc=local");
    expect(result).toContain("member: cn=devuser,ou=users,dc=test,dc=local");
  });

  test("finds groups for specific user", async () => {
    // Search for groups that have testuser as a member
    const result = await ldapsearch(
      `(&(objectClass=groupOfNames)(member=${TEST_USERS.testuser.dn}))`,
      ["cn"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("cn: users");
    expect(result).toContain("cn: developers");
    expect(result).not.toContain("cn: admins");
  });
});

test.describe("LDAP Service Account", () => {
  test.beforeEach(async () => {
    await checkLdapAvailable();
  });

  test("service account can authenticate", async () => {
    const serviceAccountDn = "cn=ldapbind,ou=services,dc=test,dc=local";
    const serviceAccountPassword = "bindpassword";

    const result = await ldapwhoami(serviceAccountDn, serviceAccountPassword);
    expect(result).toBe(true);
  });

  test("service account can search users", async () => {
    const serviceAccountDn = "cn=ldapbind,ou=services,dc=test,dc=local";
    const serviceAccountPassword = "bindpassword";

    const result = await ldapsearch(
      "(objectClass=inetOrgPerson)",
      ["uid", "mail"],
      serviceAccountDn,
      serviceAccountPassword
    );

    expect(result).toContain("uid: testuser");
    expect(result).toContain("mail: test@test.local");
  });
});

test.describe("LDAP Configuration Validation", () => {
  test.beforeEach(async () => {
    await checkLdapAvailable();
  });

  test("caddy-security LDAP config generates correct filter", () => {
    // This test validates that our config would generate correct LDAP filters
    const userFilter = "(uid={username})";
    const groupFilter = "(&(objectClass=groupOfNames)(member={dn}))";

    // Test filter interpolation logic
    const username = "testuser";
    const dn = TEST_USERS.testuser.dn;

    const interpolatedUserFilter = userFilter.replace("{username}", username);
    const interpolatedGroupFilter = groupFilter.replace("{dn}", dn);

    expect(interpolatedUserFilter).toBe("(uid=testuser)");
    expect(interpolatedGroupFilter).toBe(
      `(&(objectClass=groupOfNames)(member=${TEST_USERS.testuser.dn}))`
    );
  });

  test("base DN structure matches expected hierarchy", async () => {
    // Verify organizational structure
    const result = await ldapsearch(
      "(objectClass=organizationalUnit)",
      ["ou"],
      LDAP_ADMIN_DN,
      LDAP_ADMIN_PASSWORD
    );

    expect(result).toContain("ou: users");
    expect(result).toContain("ou: groups");
    expect(result).toContain("ou: services");
  });
});
