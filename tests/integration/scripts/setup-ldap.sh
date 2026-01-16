#!/bin/bash
# Setup LDAP with ACLs and test data for integration tests
# This script:
# 1. Applies ACLs to allow service account to search users
# 2. Creates OUs, service account, and test users
#
# Usage: ./setup-ldap.sh [container_name]

set -e

CONTAINER="${1:-openldap-test}"
ADMIN_DN="cn=admin,dc=test,dc=local"
ADMIN_PW="admin"

echo "Setting up LDAP test environment in container: $CONTAINER"

# Wait for LDAP to be ready
echo "Waiting for LDAP to be ready..."
for i in {1..30}; do
  if docker exec "$CONTAINER" ldapsearch -x -H ldap://localhost -D "$ADMIN_DN" -w "$ADMIN_PW" -b "dc=test,dc=local" "(objectClass=*)" dn >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Step 1: Apply ACLs to allow service account search
echo "Applying LDAP ACLs..."
docker exec "$CONTAINER" bash -c 'cat > /tmp/acl.ldif << EOF
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcAccess
olcAccess: {0}to * by dn.exact=gidNumber=0+uidNumber=0,cn=peercred,cn=external,cn=auth manage by * break
olcAccess: {1}to attrs=userPassword,shadowLastChange by self write by dn="cn=admin,dc=test,dc=local" write by dn="cn=ldapbind,ou=services,dc=test,dc=local" read by anonymous auth by * none
olcAccess: {2}to dn.base="" by * read
olcAccess: {3}to * by self write by dn="cn=admin,dc=test,dc=local" write by dn="cn=ldapbind,ou=services,dc=test,dc=local" read by users read by * none
EOF
ldapmodify -Y EXTERNAL -H ldapi:/// -f /tmp/acl.ldif'

echo "ACLs applied"

# Step 2: Create organizational units
echo "Creating OUs..."
docker exec "$CONTAINER" bash -c 'cat > /tmp/ous.ldif << EOF
dn: ou=users,dc=test,dc=local
objectClass: organizationalUnit
ou: users

dn: ou=groups,dc=test,dc=local
objectClass: organizationalUnit
ou: groups

dn: ou=services,dc=test,dc=local
objectClass: organizationalUnit
ou: services
EOF
ldapadd -x -H ldap://localhost -D "cn=admin,dc=test,dc=local" -w admin -f /tmp/ous.ldif 2>/dev/null || true'

# Step 3: Create service account
echo "Creating service account..."
docker exec "$CONTAINER" bash -c 'cat > /tmp/service.ldif << EOF
dn: cn=ldapbind,ou=services,dc=test,dc=local
objectClass: simpleSecurityObject
objectClass: organizationalRole
cn: ldapbind
description: Service account for LDAP binding
userPassword: bindpassword
EOF
ldapadd -x -H ldap://localhost -D "cn=admin,dc=test,dc=local" -w admin -f /tmp/service.ldif 2>/dev/null || true'

# Step 4: Create test users
echo "Creating test users..."
docker exec "$CONTAINER" bash -c 'cat > /tmp/users.ldif << EOF
dn: uid=testuser,ou=users,dc=test,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: testuser
sn: User
givenName: Test
cn: Test User
mail: test@test.local
uidNumber: 10000
gidNumber: 10000
homeDirectory: /home/testuser
userPassword: testpass

dn: uid=adminuser,ou=users,dc=test,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: adminuser
sn: Admin
givenName: Admin
cn: Admin User
mail: admin@test.local
uidNumber: 10001
gidNumber: 10000
homeDirectory: /home/adminuser
userPassword: adminpass
EOF
ldapadd -x -H ldap://localhost -D "cn=admin,dc=test,dc=local" -w admin -f /tmp/users.ldif 2>/dev/null || true'

# Step 5: Create groups
echo "Creating groups..."
docker exec "$CONTAINER" bash -c 'cat > /tmp/groups.ldif << EOF
dn: cn=users,ou=groups,dc=test,dc=local
objectClass: posixGroup
cn: users
gidNumber: 10000
memberUid: testuser
memberUid: adminuser

dn: cn=admins,ou=groups,dc=test,dc=local
objectClass: posixGroup
cn: admins
gidNumber: 10001
memberUid: adminuser
EOF
ldapadd -x -H ldap://localhost -D "cn=admin,dc=test,dc=local" -w admin -f /tmp/groups.ldif 2>/dev/null || true'

echo "LDAP setup complete!"

# Verify setup
echo ""
echo "Verifying service account can search users..."
docker exec "$CONTAINER" ldapsearch -x -H ldap://localhost \
  -D "cn=ldapbind,ou=services,dc=test,dc=local" -w bindpassword \
  -b "ou=users,dc=test,dc=local" "(objectClass=inetOrgPerson)" uid mail
