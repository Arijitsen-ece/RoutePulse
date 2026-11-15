# RoutePulse Environment & Integration Setup Guide

## 1. Required & Optional Environment Variables
Refer to `.env.example` for all supported variables:

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No (default `3000`) | HTTP + WebSocket listen port. |
| `GEMINI_API_KEY` | Optional | Enables `/api/ai/assist` natural-language timetable/alert Q&A using Gemini API. |
| `FIREBASE_PROJECT_ID` | Optional (if ADC available) | Firebase Admin SDK project ID for Auth verification, RBAC lookups, and FCM HTTP v1. |
| `FIREBASE_CLIENT_EMAIL` | Optional (for local/non-GCP) | Service account client email when not using GCP Application Default Credentials. |
| `FIREBASE_PRIVATE_KEY` | Optional (for local/non-GCP) | Service account PEM private key (`\n`-escaped). |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Path to GCP service account JSON key file. |
| `FCM_VAPID_PUBLIC_KEY` / `VITE_FCM_VAPID_PUBLIC_KEY` | Optional (for Web Push) | Public VAPID key from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates. Served safely via `GET /api/config/public`. |
| `GTFS_STATIC_FEED_URL` | Optional | HTTPS URL returning a JSON map of GTFS `.txt` files (`stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`). |
| `GTFS_RT_VEHICLE_FEED_URL` | Optional | HTTPS URL for GTFS-Realtime `VehiclePositions` JSON (`entity[]`). |
| `GTFS_RT_TRIP_UPDATES_FEED_URL` | Optional | HTTPS URL for GTFS-Realtime `TripUpdates` JSON (`entity[]`). |
| `GTFS_RT_ALERTS_FEED_URL` | Optional | HTTPS URL for GTFS-Realtime `ServiceAlerts` JSON (`entity[]`). |
| `GTFS_RT_POLL_INTERVAL_MS` | No (default `30000`) | External feed polling interval (minimum `10000` ms). |

## 2. Firebase & FCM HTTP v1 Setup
RoutePulse uses **FCM HTTP v1** via `firebase-admin/messaging` (`getMessaging(adminApp)`) rather than legacy server keys:
1. Ensure Firebase Authentication (Google Sign-In) and Firestore are enabled in your Firebase project.
2. On Google Cloud Run, attach a service account with Firebase Admin / Cloud Messaging permissions (ADC works automatically), or set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
3. Generate a Web Push certificate key pair in Firebase Console and set `FCM_VAPID_PUBLIC_KEY`.
4. The service worker at `/public/firebase-messaging-sw.js` handles background Web Push display without embedding any API keys or secrets.

## 3. Staff Role Assignment (RBAC)
Staff permissions are enforced server-side (`server/firebaseAdmin.ts`) and in `firestore.rules`:
- Roles: `passenger` (default), `moderator` (moderate reports & inspect data quality), `operator` (manage routes, stops, alerts, GTFS imports, feed endpoints), `admin` (all permissions + vehicle GPS controls, audit logs, direct FCM push dispatch).
- Grant staff access by creating a Firestore document at `staff_roles/{uid}` with `{ "role": "moderator" | "operator" | "admin", "email": "..." }`.

## 4. Local Development & Production Build
```bash
npm install
npm run dev      # Starts Express + Vite dev middleware + WebSocket on port 3000
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Production Vite client bundle -> dist/
npm start        # Runs server.ts with Node.js (PORT=3000)
```
