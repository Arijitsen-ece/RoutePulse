# RoutePulse Data Quality & Integrity Report

## 1. Verification Engine & Freshness Rules
RoutePulse separates real-time observations from static/estimated schedules using deterministic rules in `src/shared/verificationEngine.ts` and `src/shared/gtfsParser.ts`:

- **Freshness Classification (`classifyFreshnessState`)**:
  - `FRESH`: `observationTimestamp` age `<= 90` seconds.
  - `DELAYED_UPDATE`: age `90 < age <= 180` seconds (ETA interval widens automatically; confidence downgrades to `LOW`).
  - `STALE`: age `> 180` seconds (live ETA suppressed; status becomes `TRACKING_UNAVAILABLE`).
  - `UNAVAILABLE`: no GPS observation or `gpsStaleSimulated === true`.
- **Immutability of Observation Timestamps on Poll Failures**:
  - External feed polling errors (`pollExternalFeeds`) NEVER overwrite or refresh `observationTimestamp` or `lastGpsTimestamp`, ensuring stale feeds naturally age into `DELAYED_UPDATE` and `STALE` rather than falsely appearing live.
- **No False Cancellations**:
  - Missing or stale GPS transitions a route to `TRACKING_UNAVAILABLE`, never `CANCELLED`.
  - Multiple unconfirmed `MISSING_BUS` / `BREAKDOWN` passenger reports without GPS transition a route to `UNVERIFIED` (`CONFLICTING_EVIDENCE`), never `CANCELLED`.
  - `CANCELLED` requires an authoritative `CANCELLATION` / `ROUTE_SUSPENSION` alert or a GTFS-RT `TripUpdate` with `scheduleRelationship === 'CANCELED'`.

## 2. Static GTFS Validator & Completeness Checks
`validateAndImportStaticGtfs` validates `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, and optional `agency.txt` / `calendar.txt`:
- **RFC-4180 CSV Parsing**: Handles quoted fields, embedded commas, CRLF/LF, and UTF-8 BOM.
- **Coordinate Validation**: Rejects `(0, 0)` and invalid lat/lng (`isValidCoordinate`), and warns if stops fall outside the Kolkata Metropolitan bounding box (`22.15–23.15 N`, `87.95–88.85 E`).
- **Chronological Stop Times**: Verifies `HH:MM(:SS)` formatting and flags non-monotonic departure times per trip.
- **Dry-Run Support**: `POST /api/admin/import-gtfs` supports `dryRun: true` so operators can inspect errors, warnings, and summary counts before mutating live state.

## 3. Baseline Dataset Audit Metrics
- **Baseline Stops:** 18 major Kolkata transit hubs (`OPEN_LICENSED`, 100% within Kolkata Metro bounding box).
- **Baseline Corridors:** 11 routes (`ESTIMATED` / `ESTIMATED_FREQUENCY`, `officialVerifiedPercent: 0%` until an official GTFS package is imported).
- **Real-Time Quality Endpoint:** `GET /api/sources/register` (public) and `GET /api/admin/data-quality` (moderator/admin) expose live completeness, freshness counts, endpoint health, and validation warnings.
