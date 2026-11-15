# RoutePulse Data Source Register (Kolkata Metropolitan Area)

**Product:** RoutePulse — *Know the Route. Trust the Journey.*  
**Region:** Kolkata Metropolitan Area, West Bengal, India  
**Principle:** Zero fabricated government data. Every dataset, feed, and fallback layer is explicitly classified and disclosed to users.

---

## 1. Official Government & Public Transport Undertakings

| Source | Public Portal | Status in RoutePulse | Provenance Classification | Notes |
|---|---|---|---|---|
| **West Bengal Transport Department** | `https://transport.wb.gov.in/` | `NOT_PUBLICLY_AVAILABLE` | `UNVERIFIED` | Publicly exposes passenger web pages (Bus Services, Time Table, Bus Trip Planner). No public machine-readable GTFS ZIP download, REST API, or GTFS-Realtime feed is published for third-party apps. |
| **WBTC / CSTC / WBSTC / SBSTC / NBSTC** | `https://wbtconline.in/` | `NOT_PUBLICLY_AVAILABLE` | `UNVERIFIED` | Public portals exist for passenger information/intercity booking. Route numbers and corridor names are referenced for Kolkata corridor coverage, but no public open GTFS/VLTD API exists without an official MOU. |
| **Yatri Sathi & Yatri Sathi Open Data** | `https://www.yatrisathi.in/open/` | `NOT_PUBLICLY_AVAILABLE` | `UNVERIFIED` | Open Data portal exposes aggregate mobility/ride metrics rather than Kolkata bus GTFS-Realtime GPS/TripUpdates feeds. |

---

## 2. Open Transit & Geospatial Directories

| Source | Endpoint / Catalogue | Status in RoutePulse | Provenance Classification | License & Usage |
|---|---|---|---|---|
| **OpenStreetMap & PTNA Kolkata Bus Stops** | `https://www.openstreetmap.org/` | `CONNECTED` (Baseline Stop Hubs) | `OPEN_LICENSED` | Open Database License (ODbL). Supplies stop coordinates and hub metadata across Kolkata Metro; does not provide official bus departure timetables or live vehicle GPS. |
| **Mobility Database & Transitland** | `https://mobilitydatabase.org/` | `UNCONFIGURED` (Importer Ready) | `UNVERIFIED` until supplied | Inspected catalogues; no verified active Kolkata bus GTFS-RT feed is publicly listed. RoutePulse includes a full RFC-4180 Static GTFS CSV importer & external feed poller ready for licensed/official packages. |
| **Open-Meteo Weather API** | `https://api.open-meteo.com/v1/forecast` | `CONNECTED` | `OPEN_LICENSED` (CC BY 4.0) | Provides real Kolkata temperature and WMO weather codes cached every 15 minutes; hidden cleanly if unreachable. |

---

## 3. Built-In Baseline & Fallback Layers

| Layer | Status in RoutePulse | Provenance Classification | Disclosure Behaviour |
|---|---|---|---|
| **Baseline 11 Kolkata Bus Corridors** | `ACTIVE_FALLBACK` | `ESTIMATED` (`timetableBasis: ESTIMATED_FREQUENCY`) | Explicit banner: *"Estimated service frequency — not an official departure time."* Never labelled as official WBTC/CSTC published clocks. |
| **Synthetic Demonstration Vehicle Telemetry** | `ACTIVE_FALLBACK` when `GTFS_RT_VEHICLE_FEED_URL` is unset | `SYNTHETIC_DEMO` | Clearly labelled *Demonstration Telemetry* across Home, Live Map, Bus Details, Journey Planner, and Admin Console. Immediately yields when an official feed is configured. |
| **Community Passenger Observations** | `CONNECTED` (Rate-limited + Moderated) | `COMMUNITY_REPORTED` | Commuters can report arrivals, missing buses, delays, breakdowns, and diversions. Single anonymous reports never trigger an `OFFICIAL_CANCELLATION`. |
| **Admin-Verified RoutePulse Notices** | `CONNECTED` (RBAC Staff Desk) | `OFFICIAL_VERIFIED` (Admin-Verified Notice badge) | Explicitly badged *"Admin-verified RoutePulse notice (not a government announcement)"* unless ingested from an official GTFS-RT Alerts feed. |
