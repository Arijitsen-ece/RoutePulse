export type SupportedLanguage = 'en' | 'hi' | 'bn';

export type DataSourceType =
  | 'OFFICIAL_VERIFIED'
  | 'OPEN_LICENSED'
  | 'COMMUNITY_REPORTED'
  | 'ESTIMATED'
  | 'SYNTHETIC_DEMO'
  | 'UNVERIFIED';

export type TimetableBasis =
  | 'OFFICIAL_TIMETABLE'
  | 'OFFICIAL_FREQUENCY'
  | 'ESTIMATED_FREQUENCY'
  | 'HISTORICAL_TIMETABLE'
  | 'PASSENGER_OBSERVATION'
  | 'SYNTHETIC_DEMO'
  | 'UNAVAILABLE';

export type ActiveTelemetryMode =
  | 'OFFICIAL_LIVE'
  | 'OFFICIAL_STATIC'
  | 'OPEN_DATA'
  | 'PASSENGER_CONFIRMED'
  | 'SYNTHETIC_DEMO';

export type FreshnessState = 'FRESH' | 'DELAYED_UPDATE' | 'STALE' | 'UNAVAILABLE';

export type UserRole = 'passenger' | 'moderator' | 'operator' | 'admin';

export type ServiceStatus =
  | 'OPERATING'
  | 'DELAYED'
  | 'SCHEDULED'
  | 'CANCELLED'
  | 'TRACKING_UNAVAILABLE'
  | 'UNVERIFIED';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertType =
  | 'CANCELLATION'
  | 'PARTIAL_CANCELLATION'
  | 'DIVERSION'
  | 'BREAKDOWN'
  | 'DELAY'
  | 'TRAFFIC_CONGESTION'
  | 'WEATHER_DISRUPTION'
  | 'ROUTE_SUSPENSION'
  | 'SPECIAL_SERVICE'
  | 'MISSING_WARNING';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type ReportType =
  | 'ARRIVAL_CONFIRMED'
  | 'MISSING_BUS'
  | 'BREAKDOWN'
  | 'DELAY'
  | 'DIVERSION';

export type ReportVerificationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'DUPLICATE';

export interface LocalizedText {
  en: string;
  hi: string;
  bn: string;
}

export interface Operator {
  operatorId: string;
  name: string;
  shortCode: string;
  agencyType: 'STATE_UNDERTAKING' | 'PRIVATE_SYNDICATE' | 'AC_EXPRESS';
  helpline?: string;
  sourceUrl?: string;
}

export interface TransitStop {
  stopId: string;
  name: LocalizedText;
  locality: LocalizedText;
  lat: number;
  lng: number;
  zone: string;
  isMajorHub: boolean;
  wheelchairAccessible: boolean;
  sourceType: DataSourceType;
  sourceLabel: string;
}

export interface RouteStopEntry {
  routeId: string;
  stopId: string;
  sequenceOrder: number;
  distanceFromOriginKm: number;
  scheduledOffsetMin: number;
}

export interface TransitRoute {
  routeId: string;
  routeNumber: string;
  operatorId: string;
  origin: LocalizedText;
  destination: LocalizedText;
  corridorSummary: LocalizedText;
  operatingDays: string[];
  firstDeparture: string;
  lastDeparture: string;
  frequencyMin: number;
  fareMinInr: number;
  fareMaxInr: number;
  isAc: boolean;
  active: boolean;
  dataSource: DataSourceType;
  timetableBasis: TimetableBasis;
  sourceLabel: string;
  sourceUrl?: string;
  lastVerifiedAt?: number;
  stopSequence: RouteStopEntry[];
}

export interface ScheduledTrip {
  tripId: string;
  routeId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  headsign: LocalizedText;
  departureTime: string; // HH:MM
  arrivalTime: string; // HH:MM
  operatingDays: string[];
  isEstimated: boolean;
  timetableBasis: TimetableBasis;
}

export interface StopTimeEntry {
  stopTimeId: string;
  tripId: string;
  stopId: string;
  stopSequence: number;
  scheduledArrival: string; // HH:MM
  scheduledDeparture: string; // HH:MM
}

export interface Vehicle {
  vehicleId: string;
  registrationNumber: string;
  fleetCode: string;
  operatorId: string;
  routeId: string;
  isAc: boolean;
  capacity: number;
  trackingCapable: boolean;
}

export interface VehiclePosition {
  vehicleId: string;
  routeId: string;
  tripId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  lat: number;
  lng: number;
  bearing: number;
  speedKmh: number;
  currentStopSequence: number;
  nextStopId: string;
  lastGpsTimestamp: number; // observation epoch ms
  observationTimestamp: number; // source GPS timestamp (never overwritten on failed poll)
  ingestedAt: number; // server ingestion timestamp
  sourceType: DataSourceType;
  delayMinutes: number;
  gpsStaleSimulated?: boolean;
  freshnessState?: FreshnessState;
}

export interface TripUpdateStopTime {
  stopId: string;
  stopSequence?: number;
  arrivalDelaySec?: number;
  departureDelaySec?: number;
  arrivalTimeEpoch?: number;
}

export interface TripUpdateRecord {
  tripId: string;
  routeId: string;
  vehicleId?: string;
  delaySeconds: number;
  scheduleRelationship: 'SCHEDULED' | 'ADDED' | 'CANCELED' | 'SKIPPED';
  stopTimeUpdates: TripUpdateStopTime[];
  observationTimestamp: number;
  ingestedAt: number;
  sourceType: DataSourceType;
}

export interface ServiceStatusVerification {
  status: ServiceStatus;
  source: DataSourceType;
  freshnessState: FreshnessState;
  timestamp: number;
  confidence: ConfidenceLevel;
  explanationCode:
    | 'FRESH_GPS_CONFIRMED'
    | 'FRESH_GPS_DELAYED'
    | 'PASSENGER_CONSENSUS_CONFIRMED'
    | 'SCHEDULED_ONLY_NO_RT'
    | 'OFFICIAL_CANCELLATION'
    | 'STALE_OR_MISSING_GPS'
    | 'CONFLICTING_EVIDENCE';
  explanationDetail: string;
  evidenceCount: {
    gpsAgeSeconds: number | null;
    passengerConfirmations: number;
    missingReports: number;
    officialAlerts: number;
    tripUpdates: number;
  };
}

export interface EtaFeatureVector {
  routeId: string;
  targetStopId: string;
  distanceKm: number;
  stopsRemaining: number;
  currentSpeedKmh: number;
  hourOfDay: number;
  isPeakHour: boolean;
  historicalCorridorSpeedKmh: number;
}

export interface TripPrediction {
  predictionId: string;
  tripId: string;
  routeId: string;
  vehicleId: string | null;
  stopId: string;
  etaMinLow: number | null;
  etaMinHigh: number | null;
  scheduledTime: string | null;
  isEstimatedFrequency: boolean;
  timetableBasis: TimetableBasis;
  delayMinutes: number | null;
  confidence: ConfidenceLevel;
  verification: ServiceStatusVerification;
  lastUpdated: number;
  dataSource: DataSourceType;
  mlFeatures?: EtaFeatureVector;
}

export interface ServiceAlert {
  alertId: string;
  routeId: string;
  affectedStopIds: string[];
  alertType: AlertType;
  severity: AlertSeverity;
  title: LocalizedText;
  description: LocalizedText;
  sourceType: DataSourceType;
  issuingOrganization: string;
  verifiedByAdmin: boolean;
  active: boolean;
  startTime: number;
  endTime?: number;
  publicationTime: number;
  lastUpdatedTime: number;
  sourceUrl?: string;
  createdAt: number;
}

export interface PassengerReport {
  reportId: string;
  userId: string;
  userDisplayName: string;
  routeId: string;
  stopId: string;
  tripId?: string;
  reportType: ReportType;
  note: string;
  lat?: number;
  lng?: number;
  verificationStatus: ReportVerificationStatus;
  confirmationCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface JourneyLeg {
  routeId: string;
  routeNumber: string;
  operatorShortCode: string;
  fromStopId: string;
  toStopId: string;
  intermediateStopIds: string[];
  estimatedDurationMin: number;
  scheduledDeparture: string | null;
  timetableBasis: TimetableBasis;
  verification: ServiceStatusVerification;
  dataSource: DataSourceType;
}

export interface JourneyOption {
  optionId: string;
  legs: JourneyLeg[];
  totalDurationMin: number;
  walkingDistanceMeters: number;
  transfers: number;
  transferWaitMin: number;
  wheelchairAccessible: boolean;
  usesDemoTelemetry: boolean;
  usesScheduleOnly: boolean;
  usesEstimatedFrequency: boolean;
}

export interface FeedEndpointHealth {
  configured: boolean;
  urlMasked: string | null;
  status: 'CONNECTED' | 'DEGRADED' | 'UNCONFIGURED' | 'BACKOFF';
  lastSuccessfulFetch: number | null;
  lastFailedFetch: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextRetryAt: number | null;
  entityCount: number;
}

export interface FcmDeliveryHealth {
  configured: boolean;
  credentialMode: 'ADC_OR_ENV' | 'UNCONFIGURED';
  vapidConfigured: boolean;
  registeredTokensCount: number;
  sentCount: number;
  failedCount: number;
  prunedTokensCount: number;
  lastSentAt: number | null;
  lastError: string | null;
}

export interface DataQualityMetrics {
  totalRoutes: number;
  totalStops: number;
  totalTrips: number;
  officialTimetableRoutesCount: number;
  estimatedFrequencyRoutesCount: number;
  officialVerifiedPercent: number;
  stopsWithinKolkataBoundsCount: number;
  stopsOutOfBoundsCount: number;
  freshVehiclesCount: number;
  delayedVehiclesCount: number;
  staleVehiclesCount: number;
  unavailableVehiclesCount: number;
  lastValidatedAt: number;
  warnings: string[];
}

export interface DataSourceHealth {
  gtfsStaticLoaded: boolean;
  gtfsStaticLastSync: number;
  gtfsRtFeedConfigured: boolean;
  gtfsRtFeedUrlMasked: string | null;
  officialStaticFeedConnected: boolean;
  officialTripUpdatesConnected: boolean;
  officialAlertFeedConnected: boolean;
  activeTelemetryMode: ActiveTelemetryMode;
  pollIntervalMs: number;
  freshVehiclesCount: number;
  staleVehiclesCount: number;
  totalRoutes: number;
  totalStops: number;
  pendingReportsCount: number;
  activeAlertsCount: number;
  lastTickAt: number;
  vehicleFeedHealth: FeedEndpointHealth;
  tripUpdatesFeedHealth: FeedEndpointHealth;
  alertsFeedHealth: FeedEndpointHealth;
  staticFeedHealth: FeedEndpointHealth;
  fcmHealth: FcmDeliveryHealth;
  dataQuality: DataQualityMetrics;
}

export interface AuditLogEntry {
  logId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  targetType: 'ROUTE' | 'STOP' | 'ALERT' | 'REPORT' | 'FEED' | 'GTFS_IMPORT' | 'NOTIFICATION' | 'VEHICLE';
  targetId: string;
  summary: string;
  timestamp: number;
}

export interface DataSourceRegisterItem {
  id: string;
  name: string;
  category: 'OFFICIAL_GOVERNMENT' | 'OPEN_TRANSIT' | 'COMMUNITY' | 'WEATHER' | 'DEMO_FALLBACK';
  status: 'CONNECTED' | 'UNCONFIGURED' | 'NOT_PUBLICLY_AVAILABLE' | 'ACTIVE_FALLBACK';
  dataSourceType: DataSourceType;
  licenseOrTerms: string;
  endpointUrl: string | null;
  notes: string;
}

export interface TransitSnapshot {
  operators: Operator[];
  stops: TransitStop[];
  routes: TransitRoute[];
  scheduledTrips: ScheduledTrip[];
  vehicles: Vehicle[];
  vehiclePositions: VehiclePosition[];
  tripUpdates: TripUpdateRecord[];
  serviceAlerts: ServiceAlert[];
  passengerReports: PassengerReport[];
  dataHealth: DataSourceHealth;
  serverTimestamp: number;
}
