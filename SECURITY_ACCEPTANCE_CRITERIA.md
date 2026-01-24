# Security Acceptance Criteria

This document defines the security requirements and test procedures for the auth system.

## 1. Token Storage (XSS Protection)

### Requirement
- `accessToken`: ONLY in memory (Pinia store / JS variable) - NEVER in localStorage
- `refreshToken`: HttpOnly cookie managed by backend - JS cannot access

### Tests

```bash
# Test 1: accessToken not in localStorage
# After login, open browser DevTools > Application > Local Storage
# EXPECTED: No "accessToken" or "refreshToken" key
# ALLOWED: "user" key with non-sensitive metadata (email, role, createdAt)

# Test 2: refreshToken in HttpOnly cookie
# DevTools > Application > Cookies
# EXPECTED: "refreshToken" cookie with:
#   - HttpOnly: true
#   - Secure: true (in production)
#   - SameSite: Strict
#   - Path: /api/auth

# Test 3: XSS cannot steal tokens
# In browser console:
document.cookie  // Should NOT contain refreshToken (HttpOnly)
localStorage.getItem('accessToken')  // Should be null
localStorage.getItem('refreshToken')  // Should be null
```

## 2. Auth Boot Flow

### Requirement
- On page load: `refresh()` (cookie) → get accessToken → `me()` (with accessToken) → get user
- `/api/auth/me` NEVER returns tokens - only user data
- Single-flight pattern prevents race conditions

### Tests

```javascript
// Test 1: /api/auth/me requires accessToken
fetch('/api/auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
// EXPECTED: 401 "Access token required"

// Test 2: /api/auth/me with token returns only user
// (after login)
fetch('/api/auth/me', {
  headers: { 'Authorization': 'Bearer ' + accessToken },
  credentials: 'include'
}).then(r => r.json()).then(console.log)
// EXPECTED: { user: {...} } - NO accessToken in response

// Test 3: refresh returns accessToken
fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
  headers: { 'X-CSRF-Token': getCsrfToken() }
}).then(r => r.json()).then(console.log)
// EXPECTED: { accessToken: "...", user: {...} }
```

## 3. Auth Flash Bug Prevention

### Requirement
- Unauthenticated user NEVER sees dashboard content (not even 0.5s)
- Skeleton UI shown during auth check
- Router guards prevent route access until auth verified

### Tests

```bash
# Test 1: Slow network (Throttle to Slow 3G)
# 1. Clear all cookies and localStorage
# 2. Navigate to / (dashboard)
# 3. EXPECTED: Skeleton UI, then redirect to /login
# 4. MUST NOT see any dashboard content

# Test 2: Page refresh while authenticated
# 1. Login as user
# 2. Refresh page (F5)
# 3. EXPECTED: Skeleton UI briefly, then dashboard
# 4. MUST NOT see login page flash

# Test 3: HTML source inspection
# 1. As unauthenticated user, navigate to /
# 2. View page source (Ctrl+U)
# EXPECTED: No dashboard content in HTML
```

## 4. Logout State Cleanup

### Requirement
- On logout: ALL state cleared (stores, localStorage, cookies)
- User A data NEVER visible to User B after switch
- Immediate content hide (CHECKING state)

### Tests

```bash
# Test 1: User switch isolation
# 1. Login as User A
# 2. View dashboard data (note specific data)
# 3. Logout
# 4. Login as User B
# EXPECTED: No User A data visible in UI, stores, or localStorage

# Test 2: State cleanup verification
# After logout, in DevTools console:
localStorage.getItem('user')  // null
localStorage.getItem('activeCompanyId')  // null

# DevTools > Application > Cookies:
# refreshToken cookie should be cleared
# csrf_token cookie should be cleared
```

## 5. CSRF Protection

### Requirement
- Double-submit cookie pattern for cookie-based auth endpoints
- `csrf_token` cookie (non-HttpOnly) + `X-CSRF-Token` header
- Protected endpoints: `/api/auth/refresh`, `/api/auth/logout`

### Tests

```javascript
// Test 1: Refresh without CSRF token fails
fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include'
  // No X-CSRF-Token header
}).then(r => r.json()).then(console.log)
// EXPECTED: 403 "CSRF token required"

// Test 2: Refresh with wrong CSRF token fails
fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
  headers: { 'X-CSRF-Token': 'wrong_token' }
}).then(r => r.json()).then(console.log)
// EXPECTED: 403 "CSRF token invalid"

// Test 3: Refresh with correct CSRF token succeeds
const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1];
fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
  headers: { 'X-CSRF-Token': csrfToken }
}).then(r => r.json()).then(console.log)
// EXPECTED: 200 with accessToken
```

## 6. Secure Cookie Context

### Requirement
- `secure` flag set based on HTTPS context, not just NODE_ENV
- Works correctly behind reverse proxies (Render, Vercel)

### Tests

```bash
# Test 1: Production HTTPS
# In production with HTTPS:
# Cookie should have Secure flag = true

# Test 2: Development HTTP
# In development with HTTP:
# Cookie should have Secure flag = false (to work locally)

# Test 3: Proxy detection
# Check that x-forwarded-proto: https triggers secure cookies
curl -H "x-forwarded-proto: https" http://localhost:3000/api/auth/login ...
# Response Set-Cookie should have Secure flag
```

## 7. CSP and Security Headers

### Requirement
- Strict CSP without unsafe-eval in production
- HSTS, X-Frame-Options, X-Content-Type-Options
- Permissions-Policy restricts sensitive APIs

### Tests

```bash
# Test 1: Check security headers
curl -I https://your-domain.com/

# EXPECTED headers:
# Content-Security-Policy: default-src 'self'; ...
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: accelerometer=(), camera=(), ...

# Test 2: CSP violation test
# In browser console with CSP enabled:
eval('alert(1)')  // Should be blocked by CSP (no unsafe-eval)
```

## 8. Backend Authorization

### Requirement
- All protected endpoints require valid accessToken
- `Authorization: Bearer <token>` header required
- Cookies alone don't grant access (except for refresh/logout)

### Tests

```javascript
// Test 1: Protected endpoint without token
fetch('/api/exports').then(r => console.log(r.status))
// EXPECTED: 401

// Test 2: Protected endpoint with valid token
fetch('/api/exports', {
  headers: { 'Authorization': 'Bearer ' + accessToken }
}).then(r => console.log(r.status))
// EXPECTED: 200

// Test 3: Protected endpoint with only cookie (no token)
fetch('/api/exports', { credentials: 'include' })
  .then(r => console.log(r.status))
// EXPECTED: 401 (cookies don't grant access to data endpoints)
```

## Automated Test Checklist

- [ ] Unit tests for auth store (checkAuth, login, logout)
- [ ] Unit tests for CSRF middleware
- [ ] Integration tests for auth flow
- [ ] E2E test: login → view data → logout → login different user
- [ ] E2E test: page refresh maintains session
- [ ] E2E test: throttled network shows skeleton, no flash
- [ ] Security scan: no tokens in localStorage
- [ ] Security scan: CSP headers present
- [ ] Security scan: CSRF protection working

## Sign-off

| Criterion | Status | Tested By | Date |
|-----------|--------|-----------|------|
| Token Storage | [ ] | | |
| Auth Boot Flow | [ ] | | |
| Flash Prevention | [ ] | | |
| Logout Cleanup | [ ] | | |
| CSRF Protection | [ ] | | |
| Secure Cookies | [ ] | | |
| Security Headers | [ ] | | |
| Backend Auth | [ ] | | |
