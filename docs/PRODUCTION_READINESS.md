# RoutePulse Production Readiness & Security Assessment

## 1. Security & Access Control
- **Server-Verified Firebase Auth & Granular RBAC**:
  - Every privileged endpoint under `/api/admin/*` and `/api/notifications/*` verifies Firebase ID tokens via `firebase-admin/auth`.
  - Role middleware enforces least privilege: `requireModerator` (report moderation, data quality), `requireOperator` (alerts, routes, stops, GTFS import, feed URLs), and `requireAdmin` (audit logs, FCM push dispatch, demo GPS simulation).
- **Firestore Security Rules (`firestore.rules`)**:
  - Deployed and validated with `npx eslint firestore.rules` (0 errors, 0 warnings).
  - User profiles (`users/{uid}`), saved routes/stops, notifications, and FCM token records (`fcm_tokens/{tokenHash}`) are restricted to the authenticated owner (`isOwner(userId)`).
  - `staff_roles/{uid}` and `admin_audit_logs/{logId}` are locked down to admins / server Admin SDK; privilege escalation by clients is blocked.
- **Abuse & SSRF Protections**:
  - Express `trust proxy` enabled for accurate client IP detection behind Cloud Run / reverse proxies.
  - IP rate limiters (`10 req/min`) on `/api/reports` and `/api/ai/assist`, plus per-user `5 reports / 15 min` and duplicate-window checks in `TransitStateStore`.
  - External feed URL configuration (`isAllowedFeedUrl`) enforces `https://` (`http://localhost` / `127.0.0.1` permitted only for local testing) and exponential backoff (`30s -> 300s`) on failures.
  - Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`) applied on all HTTP responses.
  - No raw secrets or VAPID keys are hardcoded in `/public/firebase-messaging-sw.js` or client source.

## 2. Persistence & Scalability Considerations
- **Current State**: Active transit snapshot, external feed cache, and recent passenger reports/audit logs operate in fast server memory (`TransitStateStore`) and broadcast over WebSockets (`/ws`), while user accounts, saved favourites, FCM tokens, and audit logs persist in Cloud Firestore when Firebase Admin credentials are present.
- **Scaling to Multi-Instance Cloud Run**: If scaling horizontally across multiple Cloud Run instances, externalize `TransitStateStore` snapshot & rate-limiter buckets to Redis/Memorystore or Firestore/Cloud SQL so all instances share identical feed state and audit history.

## 3. Official Data Integration Next Steps
- Obtain official authorization / data-sharing MOU with the **West Bengal Transport Department** or **WBTC** for authenticated static GTFS archives and live VLTD/GTFS-Realtime feeds.
- Once URLs are issued, configure `GTFS_STATIC_FEED_URL`, `GTFS_RT_VEHICLE_FEED_URL`, `GTFS_RT_TRIP_UPDATES_FEED_URL`, and `GTFS_RT_ALERTS_FEED_URL` in environment secrets or the Staff Operations Console.
