# 🚌 RoutePulse
### Know the Route. Trust the Journey.

**A multilingual public bus intelligence and journey assistance platform for Kolkata, West Bengal, India.**

<p align="center">
  <strong>Track smarter. Travel better. Stay informed.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active%20Development-blue?style=for-the-badge" alt="Project Status"/>
  <img src="https://img.shields.io/badge/Platform-Web%20Application-0A66C2?style=for-the-badge" alt="Platform"/>
  <img src="https://img.shields.io/badge/Languages-English%20%7C%20Hindi%20%7C%20Bengali-138A72?style=for-the-badge" alt="Languages"/>
  <img src="https://img.shields.io/badge/License-To%20Be%20Decided-lightgrey?style=for-the-badge" alt="License"/>
</p>

---

## 🌍 About RoutePulse

Public bus passengers often face uncertainty about bus availability, departure schedules, delays, route changes and expected arrival times.

Unlike services with comprehensive railway tracking, bus information can be fragmented across different operators, routes and information sources.

**RoutePulse aims to make public bus travel more transparent, accessible and predictable.**

It is a multilingual public transport information platform designed to help passengers:

- Explore bus routes and stops.
- Access available timetables.
- View vehicle tracking when an authorised live data feed is available.
- Understand bus availability and service status.
- Estimate arrival times using available information.
- Discover alternative journeys.
- Report transport-related issues.
- Receive relevant service notifications.

The initial geographic focus is **Kolkata and the surrounding areas of West Bengal**, with an architecture designed to support future expansion.

## 🎯 Vision

Build a reliable, accessible and data-transparent public transport companion that helps passengers make better travel decisions.

**Our core principle: Never present unverified information as live or official.**

---

## ✨ Key Features

### 🚌 1. Bus Route Explorer
- Search routes by route number, origin or destination.
- Explore available bus stops.
- View route corridors and stop sequences.
- Access operator information where verified.
- Discover route information through an interactive interface.

### 📍 2. Live Bus Tracking
- Interactive map using Leaflet and OpenStreetMap.
- Vehicle markers and route visualisation.
- Direction-aware tracking architecture.
- Last-updated timestamps.
- GPS freshness monitoring.

Live vehicle tracking depends on the availability of an authorised real-time transport data feed. Demonstration telemetry is explicitly labelled and must not be interpreted as actual vehicle location.

### 🕒 3. Timetable Information
- Browse available route schedules.
- View first and last service information when published.
- Explore departure information.
- Distinguish official schedules from estimates.
- Display unavailable timetable information transparently.

### 🛡️ 4. Bus Availability & Status Verification

RoutePulse implements a six-state service verification model:

| Status | Meaning |
|---|---|
| 🟢 OPERATING | Sufficient recent evidence indicates operation |
| 🟠 DELAYED | A confirmed service is running behind schedule |
| 🔵 SCHEDULED | Listed in the timetable but not confirmed in real time |
| 🔴 CANCELLED | Supported by an authoritative cancellation notice |
| ⚪ TRACKING_UNAVAILABLE | Tracking information is stale or unavailable |
| 🟣 UNVERIFIED | Available evidence is insufficient or conflicting |

**Data integrity rules:**
- Missing GPS does not mean a bus is cancelled.
- A scheduled trip does not automatically mean it is operating.
- A single passenger report cannot establish an official cancellation.
- Old vehicle coordinates must never be presented as current.
- Every status should explain its source and freshness.

### ⏱️ 5. Estimated Arrival Time (ETA)
- Arrival-time ranges.
- Scheduled versus estimated arrival.
- Delay information where supported.
- Confidence indicators.
- Source and last-update information.

ETA predictions use available route, schedule and vehicle information. Prediction quality depends on the completeness and freshness of the underlying data.

### 🧭 6. Journey Planner
- Search journeys between locations.
- Explore direct routes.
- Find supported one-transfer alternatives.
- Display walking distances.
- Compare journey options using available schedule information.

### 📢 7. Passenger Reports
- Report missing or delayed buses.
- Report possible breakdowns.
- Submit route-related observations.
- Moderate reports before treating them as verified information.
- Apply duplicate detection and rate limiting.

Passenger reports remain community observations until appropriately verified.

### 🔔 8. Notifications
Designed to support:
- Favourite route updates.
- Verified service disruptions.
- Route diversions.
- Stop closures.
- Important service announcements.
- Relevant journey notifications.

Push notifications require the appropriate Firebase Cloud Messaging configuration.

### 🌐 9. Multilingual Support

RoutePulse supports three languages:

- 🇬🇧 English
- 🇮🇳 हिन्दी (Hindi)
- 🇮🇳 বাংলা (Bengali)

The interface uses internationalisation support with appropriate Unicode font rendering.

### 👤 10. User Accounts and Personalisation
- Google Sign-In.
- Guest browsing.
- Saved routes.
- Saved stops.
- Notification preferences.
- User profile.
- Personal travel information.

### 🛠️ 11. Admin Dashboard
Administrative capabilities include:
- Route and stop management.
- Feed configuration.
- Service alert publishing.
- Passenger report moderation.
- Data freshness monitoring.
- Administrative access controls.
- Transit data management.

Administrative operations are intended for authorised users only.

---

## 🏗️ System Architecture

RoutePulse follows a full-stack architecture with separate frontend, backend, shared domain logic and data services.

```text
              PASSENGERS / ADMIN
                       |
                       v
             REACT WEB APPLICATION
                       |
             AUTHENTICATION CONTEXT
                       |
             TRANSIT APPLICATION STATE
                       |
               REST API + WEBSOCKET
                       |
                       v
             NODE.JS / EXPRESS SERVER
                       |
          +------------+-------------+
          |            |             |
          v            v             v
     TRANSIT       VERIFICATION    GEMINI
     DATA ENGINE      ENGINE       ASSISTANT
          |            |             |
          +------------+-------------+
                       |
                       v
                FIREBASE SERVICES
                       |
              +--------+--------+
              |                 |
              v                 v
          FIRESTORE          AUTH
              |
              v
       USER DATA / REPORTS
       SAVED ROUTES / ALERTS
```

### Data Sources

RoutePulse separates transit information according to provenance:

| Source | Description |
|---|---|
| OFFICIAL_GTFS | Official timetable information, when verified and available |
| OPEN_LICENSED | Third-party open datasets with compatible licences |
| PASSENGER_CONFIRMED | Moderated community observations |
| SYNTHETIC_DEMO | Clearly labelled demonstration telemetry |
| ESTIMATED | Derived or estimated transport information |
| UNVERIFIED | Information awaiting sufficient validation |

A GTFS or GTFS-Realtime-compatible architecture does not itself provide official Kolkata transport data. Actual feed access depends on the relevant data provider and its permissions.

---

## 🧰 Technology Stack

### Frontend
- React 19
- TypeScript
- Tailwind CSS v4
- Radix UI / shadcn-style UI primitives
- Lucide React
- i18next
- react-i18next
- Leaflet
- OpenStreetMap

### Backend
- Node.js
- Express.js
- TypeScript
- REST API
- WebSocket streaming

### Authentication and Database
- Firebase Authentication
- Google Sign-In
- Cloud Firestore
- Firebase Admin SDK
- Firestore Security Rules

### AI Integration
- Google Gemini API
- Server-side transport assistant
- Grounded responses based on available RoutePulse transit information

### Development and Deployment
- Google AI Studio Build mode
- GitHub
- Vite
- ESLint
- Firebase
- Google Cloud deployment options

---

## 📂 Project Structure

```text
RoutePulse/
│
├── docs/
│   ├── DATA_SOURCE_REGISTER.md
│   ├── DATA_QUALITY_REPORT.md
│   ├── ENVIRONMENT_SETUP.md
│   └── PRODUCTION_READINESS.md
│
├── public/
│   ├── icons/
│   └── assets/
│
├── server/
│   ├── firebaseAdmin.ts
│   ├── transitState.ts
│   └── geminiAssistant.ts
│
├── src/
│   ├── components/
│   │   ├── WelcomeScreen.tsx
│   │   ├── DashboardView.tsx
│   │   ├── RouteExplorerView.tsx
│   │   ├── LiveMapView.tsx
│   │   ├── TransitMap.tsx
│   │   ├── JourneyPlannerView.tsx
│   │   ├── ReportModal.tsx
│   │   ├── SavedAndProfileView.tsx
│   │   ├── AdminDashboardView.tsx
│   │   ├── StatusIndicator.tsx
│   │   └── ui/
│   │
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── TransitContext.tsx
│   │
│   ├── i18n/
│   │   └── index.ts
│   │
│   └── shared/
│       ├── types.ts
│       ├── kolkataTransitData.ts
│       └── verificationEngine.ts
│
├── server.ts
├── firebase-blueprint.json
├── firestore.rules
├── security_spec.md
├── eslint.config.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

*The structure above describes the intended project organisation; verify the actual repository before relying on every listed path.*

---

## 🚀 Getting Started

### Prerequisites

Install:

- Node.js (LTS recommended).
- npm.
- Git.
- A Firebase project for authentication and Firestore features.
- A Gemini API key if the AI assistant is enabled.

### 1. Clone the Repository

```bash
git clone https://github.com/Arijitsen-ece/RoutePulse.git

cd RoutePulse
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a local `.env` file using `.env.example` as a reference.

Example configuration names:

```env
PORT=3000

GEMINI_API_KEY=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

GTFS_STATIC_FEED_URL=
GTFS_RT_VEHICLE_FEED_URL=
GTFS_RT_TRIP_UPDATES_FEED_URL=
GTFS_RT_ALERTS_FEED_URL=

FCM_VAPID_PUBLIC_KEY=
```

Only configure variables that are actually supported by your implementation.

Do not commit `.env` files, private keys or service-account credentials.

For Firebase Admin SDK, use secure server-side credentials or Application Default Credentials where supported.

### 4. Start the Application

Check the scripts available in `package.json`.

For a project configured with the standard Vite development script:

```bash
npm run dev
```

If the backend and frontend use separate scripts, follow the project's development instructions in `docs/ENVIRONMENT_SETUP.md`.

### 5. Build for Production

```bash
npm run build
```

### 6. Run Code Checks

```bash
npm run lint
```

Check the actual `package.json` scripts for available tests and validation commands.

---

## 🔐 Security and Privacy

Security is a core requirement of RoutePulse.

The project is designed around:

- Firebase ID-token verification.
- Server-side administrative role validation.
- Firestore Security Rules.
- Owner-only access to personal information.
- Input validation.
- Passenger-report rate limiting.
- Duplicate report detection.
- Protected backend credentials.
- Secure API communication.
- Controlled location access.

**Never commit these files or values:**

- `.env`
- `.env.local`
- Firebase service-account private keys.
- Gemini API keys.
- FCM credentials.
- Private transport feed credentials.

Public repository access means the source code is visible to everyone. Review the entire commit history before sharing the project.

---

## 📡 Data Reliability and Limitations

RoutePulse is designed to communicate uncertainty honestly.

Not every transport operator provides publicly accessible real-time GPS, official GTFS-Realtime feeds or complete published timetables.

Therefore:

- Official live tracking requires a genuine authorised data source.
- Timetable accuracy depends on the original publisher.
- Estimated service frequencies are not official departure times.
- Passenger observations are not automatically official announcements.
- Demonstration GPS data is never represented as actual vehicle movement.
- Missing tracking information does not establish cancellation.

The initial project focuses on a Kolkata transport-data foundation. Complete coverage of all government and private operators has not been established.

---

## 🗺️ Development Roadmap

- [x] Initial full-stack application architecture
- [x] React and TypeScript frontend
- [x] Express backend and API structure
- [x] Firebase Authentication integration
- [x] Firestore integration
- [x] English, Hindi and Bengali interface
- [x] Six-state service verification model
- [x] Deterministic ETA prediction architecture
- [x] Journey planner foundation
- [x] Interactive map integration
- [x] Passenger report and moderation foundation
- [x] Admin dashboard foundation
- [x] Initial GitHub repository

### Upcoming Improvements

- [ ] Verify and expand official Kolkata route coverage
- [ ] Import licensed and validated static GTFS datasets
- [ ] Establish authorised real-time GPS data integrations
- [ ] Integrate verified official service-alert feeds
- [ ] Complete Firebase Cloud Messaging setup
- [ ] Improve ETA prediction using historical observations
- [ ] Expand transport operator coverage
- [ ] Improve accessibility and offline support
- [ ] Conduct real-world passenger testing
- [ ] Production security and performance audit
- [ ] Expand to additional West Bengal cities

---

## 🧪 Testing and Quality Assurance

The initial development process has included:

- TypeScript checks.
- ESLint validation.
- Vite production build.
- Firestore Security Rules checks.
- Transit verification engine tests.
- Journey planner tests.
- Backend health endpoint checks.
- REST API checks.

These checks describe the reported development results; they do not establish that every production integration or real-world transport-data source is operational.

Further testing with independently verified transport data is required.

---

## 🤝 Contributing

Contributions, ideas and technical feedback are welcome.

Potential contribution areas:

- GTFS and GTFS-Realtime integrations.
- Kolkata transport data verification.
- Frontend and accessibility improvements.
- ETA algorithms.
- Journey planning.
- Security and testing.
- Multilingual support.
- Documentation.

### Contribution Workflow

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run the relevant checks.
5. Submit a pull request with a clear explanation.

Please do not contribute private API credentials, copyrighted datasets without permission or fabricated transport information.

---

## 🌱 Future Vision

RoutePulse aims to develop beyond a basic bus tracker.

The long-term vision includes:

- More comprehensive public bus information.
- Better service reliability indicators.
- Passenger-supported transport intelligence.
- More accurate arrival predictions.
- Verified disruption notifications.
- Accessible multi-modal journey planning.
- Expansion across West Bengal and potentially other Indian cities.

The ultimate goal is to reduce uncertainty in everyday public transport journeys.

---

## 👨‍💻 Project

**RoutePulse — Know the Route. Trust the Journey.**

Developed as an independent public transport technology project focused on Kolkata, West Bengal, India.

**GitHub Repository:**  
https://github.com/Arijitsen-ece/RoutePulse

**Project Focus:** Public Transport • Smart Mobility • Geospatial Technology • Full-Stack Development • Data Reliability • AI-Assisted Transit Information

---

## 📜 License

A repository being publicly visible does not automatically grant permission to reuse its code.

Choose and add an appropriate open-source licence before inviting external reuse. Until a licence is added, all rights remain reserved by the copyright holder, subject to applicable law.

---

<p align="center">
  <strong>RoutePulse</strong><br/>
  Know the Route. Trust the Journey.<br/>
  <em>Making public transport information clearer, smarter and more reliable.</em>
</p>
