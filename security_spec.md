# RoutePulse Firestore Security Specification

## 1. Data Invariants
1. **Strict PII Isolation**: `/users/{userId}` documents (containing email, displayName, and manual location) are readable and writable ONLY by the owning authenticated user (`request.auth.uid == userId`) or a verified admin. No blanket signed-in list or cross-user reads are permitted.
2. **Self-Assigned Privilege Prevention**: Users creating or updating `/users/{userId}` MUST have `role == 'passenger'` unless verified as an admin. Users cannot escalate themselves to `'admin'`.
3. **Passenger Report Integrity**:
   - Creating a `/passenger_reports/{reportId}` requires `request.auth != null`, `email_verified == true`, `incoming().userId == request.auth.uid`, and `incoming().verificationStatus == 'PENDING'`.
   - A passenger cannot self-confirm their own report (`CONFIRMED`) or mark it official.
   - Once a report enters a terminal state (`CONFIRMED`, `REJECTED`, `DUPLICATE`), non-admin updates are blocked.
   - Listing `passenger_reports` is restricted either to the report owner (`resource.data.userId == request.auth.uid`) or verified admins, or for confirmed public consensus (`resource.data.verificationStatus == 'CONFIRMED'`).
4. **Master Gate on Subcollections**: `/users/{userId}/favourite_routes/{routeId}`, `/users/{userId}/favourite_stops/{stopId}`, and `/users/{userId}/notifications/{notificationId}` enforce `request.auth.uid == userId` and `incoming().userId == userId` with `exists()` / parent ownership binding.
5. **Admin-Only Authoritative Transit Data**: `/operators`, `/routes`, and `/service_alerts` are publicly readable (for guest browsing), but writes (`create`, `update`, `delete`) are strictly limited to verified administrators.
6. **Temporal Integrity & Size Bounds**: Every `create` validates `createdAt == request.time` (and `updatedAt == request.time` where applicable). Every string field has strict `.size()` upper bounds, and all document IDs pass `isValidId()` (`^[a-zA-Z0-9_-]+$`, max 128 chars).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Cross-User Profile Read**: User B attempts `get(/users/userA)` -> DENIED.
2. **Role Escalation on Create**: User A creates `/users/userA` with `{ role: 'admin', ... }` -> DENIED.
3. **Role Escalation on Update**: User A updates `/users/userA` changing `role` from `'passenger'` to `'admin'` -> DENIED.
4. **Shadow Field Injection on Profile**: User A updates `/users/userA` with `{ isVerifiedSuperUser: true }` -> DENIED by `hasOnly()`.
5. **Unverified Email Report**: Unverified auth token (`email_verified: false`) creates `/passenger_reports/rep1` -> DENIED.
6. **Impersonated Passenger Report**: User A creates `/passenger_reports/rep2` with `{ userId: 'userB' }` -> DENIED.
7. **Self-Confirmed Passenger Report**: User A creates `/passenger_reports/rep3` with `{ verificationStatus: 'CONFIRMED' }` -> DENIED.
8. **Terminal Report Tampering**: User A updates `/passenger_reports/rep_confirmed` after status is `'CONFIRMED'` -> DENIED.
9. **Spoofed Timestamp**: User A creates `/passenger_reports/rep4` with backdated `createdAt` (`!= request.time`) -> DENIED.
10. **Oversized Note / Value Poisoning**: User A creates `/passenger_reports/rep5` with a 5,000-character `note` -> DENIED (`note.size() <= 400`).
11. **Non-Admin Official Alert Creation**: Regular user attempts `create` on `/service_alerts/alert99` -> DENIED.
12. **Blanket User List Scraping**: Signed-in user attempts `list` on `/users` -> DENIED.
