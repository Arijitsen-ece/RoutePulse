import { classifyFreshnessState } from './gtfsParser.ts';
import type {
  ConfidenceLevel,
  DataSourceType,
  EtaFeatureVector,
  FreshnessState,
  JourneyOption,
  Operator,
  PassengerReport,
  ServiceAlert,
  ServiceStatusVerification,
  TransitRoute,
  TransitStop,
  TripPrediction,
  TripUpdateRecord,
  VehiclePosition,
} from './types.ts';

const FRESH_GPS_THRESHOLD_SEC = 90;
const DELAYED_GPS_THRESHOLD_SEC = 180;
const PASSENGER_REPORT_WINDOW_MS = 35 * 60 * 1000;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatScheduledTimeOffset(baseDate: Date, offsetMin: number): string {
  const target = new Date(baseDate.getTime() + offsetMin * 60 * 1000);
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getKolkataWeekdayName(now: number): string {
  // IST = UTC+05:30
  const ist = new Date(now + 330 * 60 * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[ist.getUTCDay()];
}

function getBaselineCorridorSpeedKmh(hour: number): number {
  if ((hour >= 9 && hour <= 11) || (hour >= 17 && hour <= 20)) {
    return 15.5;
  }
  if (hour >= 22 || hour <= 5) {
    return 26.0;
  }
  return 19.5;
}

/**
 * 6-State Bus Availability & Status Verification Engine
 * Strictly distinguishes OPERATING, DELAYED, SCHEDULED, CANCELLED, TRACKING_UNAVAILABLE, UNVERIFIED.
 * Never equates missing GPS with cancellation; never marks unverified single reports as official cancellations.
 */
export function verifyRouteServiceStatus(params: {
  route: TransitRoute;
  positions: VehiclePosition[];
  alerts: ServiceAlert[];
  reports: PassengerReport[];
  tripUpdates?: TripUpdateRecord[];
  now: number;
}): ServiceStatusVerification {
  const { route, positions, alerts, reports, tripUpdates = [], now } = params;

  const routeAlerts = alerts.filter((a) => a.active && (a.routeId === route.routeId || a.routeId === 'ALL'));
  const routeTripUpdates = tripUpdates.filter((tu) => tu.routeId === route.routeId);

  const officialCancelAlert = routeAlerts.find(
    (a) =>
      (a.alertType === 'CANCELLATION' || a.alertType === 'ROUTE_SUSPENSION') &&
      (a.sourceType === 'OFFICIAL_VERIFIED' || a.verifiedByAdmin)
  );
  const officialTripCancel = routeTripUpdates.find((tu) => tu.scheduleRelationship === 'CANCELED');

  const recentReports = reports.filter(
    (r) => r.routeId === route.routeId && now - r.createdAt <= PASSENGER_REPORT_WINDOW_MS
  );
  const arrivalConfirmations = recentReports.filter(
    (r) => r.reportType === 'ARRIVAL_CONFIRMED' && r.verificationStatus !== 'REJECTED'
  );
  const missingOrBreakdownReports = recentReports.filter(
    (r) =>
      (r.reportType === 'MISSING_BUS' || r.reportType === 'BREAKDOWN') &&
      r.verificationStatus !== 'REJECTED'
  );

  const routePositions = positions.filter((p) => p.routeId === route.routeId);
  const sortedByFreshness = [...routePositions].sort(
    (a, b) => (b.observationTimestamp || b.lastGpsTimestamp) - (a.observationTimestamp || a.lastGpsTimestamp)
  );
  const freshestPos = sortedByFreshness[0] ?? null;
  const obsTs = freshestPos ? freshestPos.observationTimestamp || freshestPos.lastGpsTimestamp : null;
  const gpsAgeSec = obsTs !== null ? Math.max(0, Math.round((now - obsTs) / 1000)) : null;
  const freshnessState: FreshnessState = freshestPos
    ? classifyFreshnessState(obsTs, now, freshestPos.gpsStaleSimulated)
    : 'UNAVAILABLE';

  // 1. Authoritative Cancellation (never triggered by missing GPS or single anonymous report)
  if (officialCancelAlert || officialTripCancel) {
    return {
      status: 'CANCELLED',
      source: officialCancelAlert ? officialCancelAlert.sourceType : 'OFFICIAL_VERIFIED',
      freshnessState,
      timestamp: officialCancelAlert ? officialCancelAlert.lastUpdatedTime : officialTripCancel!.observationTimestamp,
      confidence: 'HIGH',
      explanationCode: 'OFFICIAL_CANCELLATION',
      explanationDetail: officialCancelAlert
        ? officialCancelAlert.description.en
        : 'Trip marked CANCELED in GTFS-Realtime TripUpdates feed.',
      evidenceCount: {
        gpsAgeSeconds: gpsAgeSec,
        passengerConfirmations: arrivalConfirmations.length,
        missingReports: missingOrBreakdownReports.length,
        officialAlerts: routeAlerts.length,
        tripUpdates: routeTripUpdates.length,
      },
    };
  }

  // 2. Conflicting Evidence Check (multiple passenger missing/breakdown reports when live GPS is stale/absent)
  if (
    missingOrBreakdownReports.length >= 2 &&
    (freshnessState === 'STALE' || freshnessState === 'UNAVAILABLE') &&
    arrivalConfirmations.length === 0
  ) {
    return {
      status: 'UNVERIFIED',
      source: 'COMMUNITY_REPORTED',
      freshnessState,
      timestamp: missingOrBreakdownReports[0].createdAt,
      confidence: 'LOW',
      explanationCode: 'CONFLICTING_EVIDENCE',
      explanationDetail:
        'Multiple passenger reports indicate a missing or broken-down bus while live GPS confirmation is unavailable. Not officially cancelled.',
      evidenceCount: {
        gpsAgeSeconds: gpsAgeSec,
        passengerConfirmations: arrivalConfirmations.length,
        missingReports: missingOrBreakdownReports.length,
        officialAlerts: routeAlerts.length,
        tripUpdates: routeTripUpdates.length,
      },
    };
  }

  // 3. Fresh or Slightly Delayed GPS Telemetry
  if (freshestPos && (freshnessState === 'FRESH' || freshnessState === 'DELAYED_UPDATE')) {
    const tuDelayMin = routeTripUpdates.length > 0 ? Math.round(routeTripUpdates[0].delaySeconds / 60) : 0;
    const effectiveDelayMin = Math.max(freshestPos.delayMinutes, tuDelayMin);
    const hasDelayAlert = routeAlerts.some(
      (a) =>
        (a.alertType === 'DELAY' || a.alertType === 'TRAFFIC_CONGESTION' || a.alertType === 'WEATHER_DISRUPTION') &&
        (a.sourceType === 'OFFICIAL_VERIFIED' || a.verifiedByAdmin || a.sourceType === 'SYNTHETIC_DEMO')
    );
    const isDelayed = effectiveDelayMin >= 5 || hasDelayAlert;
    const source: DataSourceType = freshestPos.sourceType;
    return {
      status: isDelayed ? 'DELAYED' : 'OPERATING',
      source,
      freshnessState,
      timestamp: obsTs!,
      confidence: source === 'OFFICIAL_VERIFIED' && freshnessState === 'FRESH' ? 'HIGH' : 'MEDIUM',
      explanationCode: isDelayed ? 'FRESH_GPS_DELAYED' : 'FRESH_GPS_CONFIRMED',
      explanationDetail: isDelayed
        ? `Vehicle telemetry active (${gpsAgeSec}s ago), running approx. ${effectiveDelayMin || 5}+ min behind schedule.`
        : `Vehicle telemetry active (${gpsAgeSec}s ago), progressing normally along corridor.`,
      evidenceCount: {
        gpsAgeSeconds: gpsAgeSec,
        passengerConfirmations: arrivalConfirmations.length,
        missingReports: missingOrBreakdownReports.length,
        officialAlerts: routeAlerts.length,
        tripUpdates: routeTripUpdates.length,
      },
    };
  }

  // 4. Crowd-verified passenger consensus when GPS is absent/stale
  const confirmedArrivals = arrivalConfirmations.filter(
    (r) => r.verificationStatus === 'CONFIRMED' || r.confirmationCount >= 2
  );
  if (confirmedArrivals.length > 0 || arrivalConfirmations.length >= 2) {
    const latest = arrivalConfirmations[0];
    return {
      status: 'OPERATING',
      source: 'COMMUNITY_REPORTED',
      freshnessState,
      timestamp: latest.createdAt,
      confidence: 'MEDIUM',
      explanationCode: 'PASSENGER_CONSENSUS_CONFIRMED',
      explanationDetail: `Confirmed by ${arrivalConfirmations.length} passenger arrival observations in the last 35 minutes.`,
      evidenceCount: {
        gpsAgeSeconds: gpsAgeSec,
        passengerConfirmations: arrivalConfirmations.length,
        missingReports: missingOrBreakdownReports.length,
        officialAlerts: routeAlerts.length,
        tripUpdates: routeTripUpdates.length,
      },
    };
  }

  // 5. Stale GPS (> 180s or gpsStaleSimulated) -> TRACKING_UNAVAILABLE (not cancelled!)
  if (freshestPos && (freshnessState === 'STALE' || freshnessState === 'UNAVAILABLE')) {
    return {
      status: 'TRACKING_UNAVAILABLE',
      source: freshestPos.sourceType,
      freshnessState,
      timestamp: obsTs ?? now,
      confidence: 'LOW',
      explanationCode: 'STALE_OR_MISSING_GPS',
      explanationDetail:
        'Last GPS signal is stale or tracking hardware is offline. Missing GPS does not mean the bus is cancelled.',
      evidenceCount: {
        gpsAgeSeconds: gpsAgeSec,
        passengerConfirmations: arrivalConfirmations.length,
        missingReports: missingOrBreakdownReports.length,
        officialAlerts: routeAlerts.length,
        tripUpdates: routeTripUpdates.length,
      },
    };
  }

  // 6. Schedule/frequency-only fallback -> SCHEDULED (never pretend schedule is live arrival!)
  return {
    status: 'SCHEDULED',
    source: route.dataSource,
    freshnessState: 'UNAVAILABLE',
    timestamp: now,
    confidence: 'LOW',
    explanationCode: 'SCHEDULED_ONLY_NO_RT',
    explanationDetail:
      route.timetableBasis === 'ESTIMATED_FREQUENCY'
        ? 'Estimated corridor frequency only; no live GPS telemetry or passenger confirmation available yet.'
        : 'Listed in timetable; no live GPS telemetry or passenger confirmation available for this departure yet.',
    evidenceCount: {
      gpsAgeSeconds: null,
      passengerConfirmations: arrivalConfirmations.length,
      missingReports: missingOrBreakdownReports.length,
      officialAlerts: routeAlerts.length,
      tripUpdates: routeTripUpdates.length,
    },
  };
}

/**
 * Deterministic ETA & Delay Prediction Engine
 * Uses vehicle position, TripUpdates, Haversine distance, stop sequence remaining, speed, and corridor baseline.
 * Never fabricates official departure times when timetableBasis is ESTIMATED_FREQUENCY or UNAVAILABLE.
 */
export function predictStopArrivalsForRoute(params: {
  route: TransitRoute;
  targetStopId: string;
  stopsMap: Map<string, TransitStop>;
  positions: VehiclePosition[];
  alerts: ServiceAlert[];
  reports: PassengerReport[];
  tripUpdates?: TripUpdateRecord[];
  now: number;
}): TripPrediction[] {
  const { route, targetStopId, stopsMap, positions, alerts, reports, tripUpdates = [], now } = params;
  const targetStopEntry = route.stopSequence.find((s) => s.stopId === targetStopId);
  const targetStop = stopsMap.get(targetStopId);
  if (!targetStopEntry || !targetStop) return [];

  const verification = verifyRouteServiceStatus({ route, positions, alerts, reports, tripUpdates, now });
  const nowDate = new Date(now);
  const hour = nowDate.getHours();
  const baselineSpeed = getBaselineCorridorSpeedKmh(hour);
  const routePositions = positions.filter((p) => p.routeId === route.routeId);
  const isEstimatedFrequency =
    route.timetableBasis === 'ESTIMATED_FREQUENCY' ||
    route.timetableBasis === 'SYNTHETIC_DEMO' ||
    route.timetableBasis === 'UNAVAILABLE';

  if (verification.status === 'CANCELLED') {
    return [
      {
        predictionId: `pred_${route.routeId}_${targetStopId}_cancelled`,
        tripId: `trip_${route.routeId}_cancelled`,
        routeId: route.routeId,
        vehicleId: null,
        stopId: targetStopId,
        etaMinLow: null,
        etaMinHigh: null,
        scheduledTime: isEstimatedFrequency ? null : formatScheduledTimeOffset(nowDate, route.frequencyMin),
        isEstimatedFrequency,
        timetableBasis: route.timetableBasis,
        delayMinutes: null,
        confidence: 'HIGH',
        verification,
        lastUpdated: verification.timestamp,
        dataSource: verification.source,
      },
    ];
  }

  const predictions: TripPrediction[] = [];

  for (const pos of routePositions) {
    const obsTs = pos.observationTimestamp || pos.lastGpsTimestamp;
    const gpsAgeSec = Math.max(0, Math.round((now - obsTs) / 1000));
    const freshness = classifyFreshnessState(obsTs, now, pos.gpsStaleSimulated);
    const stopsRemaining = targetStopEntry.sequenceOrder - pos.currentStopSequence;
    if (stopsRemaining < 0) continue;

    const matchingTripUpdate = tripUpdates.find(
      (tu) => tu.tripId === pos.tripId || tu.vehicleId === pos.vehicleId
    );
    const stopTimeUpdate = matchingTripUpdate?.stopTimeUpdates.find((s) => s.stopId === targetStopId);

    const distKm = haversineKm(pos.lat, pos.lng, targetStop.lat, targetStop.lng);
    const roadDistanceKm = Number((distKm * 1.28).toFixed(2));
    const isUsableGps = freshness === 'FRESH' || freshness === 'DELAYED_UPDATE';
    const effectiveSpeed =
      pos.speedKmh >= 6 && isUsableGps
        ? pos.speedKmh * 0.65 + baselineSpeed * 0.35
        : baselineSpeed;

    const dwellMin = stopsRemaining * 0.75;
    const travelMin = (roadDistanceKm / Math.max(10, effectiveSpeed)) * 60 + dwellMin;
    const tuDelayMin =
      stopTimeUpdate?.arrivalDelaySec !== undefined
        ? Math.round(stopTimeUpdate.arrivalDelaySec / 60)
        : matchingTripUpdate
          ? Math.round(matchingTripUpdate.delaySeconds / 60)
          : 0;
    const effectiveDelayMin = Math.max(pos.delayMinutes, tuDelayMin);

    let etaLow: number | null = null;
    let etaHigh: number | null = null;
    let confidence: ConfidenceLevel = 'LOW';

    if (freshness === 'FRESH') {
      const center = Math.max(1, Math.round(travelMin));
      const spread = center <= 6 ? 2 : Math.max(2, Math.round(center * 0.18));
      etaLow = Math.max(1, center - Math.floor(spread / 2));
      etaHigh = center + Math.ceil(spread / 2);
      confidence = pos.sourceType === 'OFFICIAL_VERIFIED' ? 'HIGH' : 'MEDIUM';
    } else if (freshness === 'DELAYED_UPDATE') {
      // Widened range when telemetry is 90-180s old
      const center = Math.max(1, Math.round(travelMin + gpsAgeSec / 60));
      const spread = Math.max(4, Math.round(center * 0.3));
      etaLow = Math.max(1, center - Math.floor(spread / 2));
      etaHigh = center + Math.ceil(spread / 2);
      confidence = 'LOW';
    }

    const mlFeatures: EtaFeatureVector = {
      routeId: route.routeId,
      targetStopId,
      distanceKm: roadDistanceKm,
      stopsRemaining,
      currentSpeedKmh: pos.speedKmh,
      hourOfDay: hour,
      isPeakHour: (hour >= 9 && hour <= 11) || (hour >= 17 && hour <= 20),
      historicalCorridorSpeedKmh: baselineSpeed,
    };

    predictions.push({
      predictionId: `pred_${pos.vehicleId}_${targetStopId}`,
      tripId: pos.tripId,
      routeId: route.routeId,
      vehicleId: pos.vehicleId,
      stopId: targetStopId,
      etaMinLow: etaLow,
      etaMinHigh: etaHigh,
      scheduledTime: isEstimatedFrequency
        ? null
        : formatScheduledTimeOffset(nowDate, Math.max(2, Math.round(travelMin) - effectiveDelayMin)),
      isEstimatedFrequency,
      timetableBasis: route.timetableBasis,
      delayMinutes: isUsableGps ? effectiveDelayMin : null,
      confidence,
      verification,
      lastUpdated: obsTs,
      dataSource: pos.sourceType,
      mlFeatures,
    });
  }

  if (predictions.length === 0) {
    predictions.push({
      predictionId: `pred_${route.routeId}_${targetStopId}_sched`,
      tripId: `trip_${route.routeId}_next_sched`,
      routeId: route.routeId,
      vehicleId: null,
      stopId: targetStopId,
      etaMinLow: null,
      etaMinHigh: null,
      scheduledTime: isEstimatedFrequency ? null : formatScheduledTimeOffset(nowDate, route.frequencyMin),
      isEstimatedFrequency,
      timetableBasis: route.timetableBasis,
      delayMinutes: null,
      confidence: 'LOW',
      verification,
      lastUpdated: now,
      dataSource: route.dataSource,
    });
  }

  return predictions.sort((a, b) => (a.etaMinLow ?? 999) - (b.etaMinLow ?? 999));
}

/**
 * Source-to-destination journey planner supporting direct routes and feasible 1-transfer hubs.
 * Enforces operatingDays check, active route flag, and dynamic transfer wait calculation.
 */
export function planJourney(params: {
  fromStopId: string;
  toStopId: string;
  userLat?: number;
  userLng?: number;
  routes: TransitRoute[];
  operators: Operator[];
  stopsMap: Map<string, TransitStop>;
  positions: VehiclePosition[];
  alerts: ServiceAlert[];
  reports: PassengerReport[];
  tripUpdates?: TripUpdateRecord[];
  now: number;
}): JourneyOption[] {
  const {
    fromStopId,
    toStopId,
    userLat,
    userLng,
    routes,
    operators,
    stopsMap,
    positions,
    alerts,
    reports,
    tripUpdates = [],
    now,
  } = params;
  if (!fromStopId || !toStopId || fromStopId === toStopId) return [];

  const todayName = getKolkataWeekdayName(now);
  const opMap = new Map(operators.map((o) => [o.operatorId, o]));
  const fromStop = stopsMap.get(fromStopId);
  const toStop = stopsMap.get(toStopId);
  const walkingMeters =
    userLat !== undefined && userLng !== undefined && fromStop
      ? Math.round(haversineKm(userLat, userLng, fromStop.lat, fromStop.lng) * 1000)
      : 180;

  const activeOperatingRoutes = routes.filter(
    (r) => r.active && (r.operatingDays.length === 0 || r.operatingDays.includes(todayName))
  );

  const options: JourneyOption[] = [];
  const nowDate = new Date(now);

  // 1. Direct Routes
  for (const route of activeOperatingRoutes) {
    const fromEntry = route.stopSequence.find((s) => s.stopId === fromStopId);
    const toEntry = route.stopSequence.find((s) => s.stopId === toStopId);
    if (!fromEntry || !toEntry) continue;

    const isForward = fromEntry.sequenceOrder < toEntry.sequenceOrder;
    const slice = isForward
      ? route.stopSequence.filter(
          (s) => s.sequenceOrder >= fromEntry.sequenceOrder && s.sequenceOrder <= toEntry.sequenceOrder
        )
      : [...route.stopSequence]
          .filter((s) => s.sequenceOrder >= toEntry.sequenceOrder && s.sequenceOrder <= fromEntry.sequenceOrder)
          .reverse();

    const durationMin = Math.max(8, Math.abs(toEntry.scheduledOffsetMin - fromEntry.scheduledOffsetMin));
    const verification = verifyRouteServiceStatus({ route, positions, alerts, reports, tripUpdates, now });
    const op = opMap.get(route.operatorId);
    const isEstFreq =
      route.timetableBasis === 'ESTIMATED_FREQUENCY' ||
      route.timetableBasis === 'SYNTHETIC_DEMO' ||
      route.timetableBasis === 'UNAVAILABLE';
    const usesDemo = verification.source === 'SYNTHETIC_DEMO';
    const usesSched =
      verification.status === 'SCHEDULED' || verification.status === 'TRACKING_UNAVAILABLE';

    options.push({
      optionId: `direct_${route.routeId}_${fromStopId}_${toStopId}`,
      legs: [
        {
          routeId: route.routeId,
          routeNumber: route.routeNumber,
          operatorShortCode: op?.shortCode ?? 'WBTC',
          fromStopId,
          toStopId,
          intermediateStopIds: slice.slice(1, -1).map((s) => s.stopId),
          estimatedDurationMin: durationMin,
          scheduledDeparture: isEstFreq
            ? null
            : formatScheduledTimeOffset(nowDate, Math.min(route.frequencyMin, 10)),
          timetableBasis: route.timetableBasis,
          verification,
          dataSource: verification.source,
        },
      ],
      totalDurationMin: durationMin + Math.round(walkingMeters / 75),
      walkingDistanceMeters: walkingMeters,
      transfers: 0,
      transferWaitMin: 0,
      wheelchairAccessible: Boolean(fromStop?.wheelchairAccessible && toStop?.wheelchairAccessible),
      usesDemoTelemetry: usesDemo,
      usesScheduleOnly: usesSched,
      usesEstimatedFrequency: isEstFreq,
    });
  }

  // 2. Feasible 1-Transfer Routes
  for (const r1 of activeOperatingRoutes) {
    const r1From = r1.stopSequence.find((s) => s.stopId === fromStopId);
    if (!r1From) continue;

    for (const r2 of activeOperatingRoutes) {
      if (r1.routeId === r2.routeId) continue;
      const r2To = r2.stopSequence.find((s) => s.stopId === toStopId);
      if (!r2To) continue;

      const sharedStops = r1.stopSequence.filter((s1) =>
        r2.stopSequence.some(
          (s2) => s2.stopId === s1.stopId && s1.stopId !== fromStopId && s1.stopId !== toStopId
        )
      );

      for (const transferS1 of sharedStops) {
        const transferS2 = r2.stopSequence.find((s) => s.stopId === transferS1.stopId)!;
        const transferStop = stopsMap.get(transferS1.stopId);
        const leg1Dur = Math.max(6, Math.abs(transferS1.scheduledOffsetMin - r1From.scheduledOffsetMin));
        const leg2Dur = Math.max(6, Math.abs(r2To.scheduledOffsetMin - transferS2.scheduledOffsetMin));
        const transferWaitMin = Math.max(4, Math.min(20, Math.round(r2.frequencyMin / 2)));

        const v1 = verifyRouteServiceStatus({ route: r1, positions, alerts, reports, tripUpdates, now });
        const v2 = verifyRouteServiceStatus({ route: r2, positions, alerts, reports, tripUpdates, now });
        if (v1.status === 'CANCELLED' || v2.status === 'CANCELLED') continue;

        const leg1Slice =
          r1From.sequenceOrder < transferS1.sequenceOrder
            ? r1.stopSequence.filter(
                (s) => s.sequenceOrder > r1From.sequenceOrder && s.sequenceOrder < transferS1.sequenceOrder
              )
            : [...r1.stopSequence]
                .filter((s) => s.sequenceOrder > transferS1.sequenceOrder && s.sequenceOrder < r1From.sequenceOrder)
                .reverse();

        const leg2Slice =
          transferS2.sequenceOrder < r2To.sequenceOrder
            ? r2.stopSequence.filter(
                (s) => s.sequenceOrder > transferS2.sequenceOrder && s.sequenceOrder < r2To.sequenceOrder
              )
            : [...r2.stopSequence]
                .filter((s) => s.sequenceOrder > r2To.sequenceOrder && s.sequenceOrder < transferS2.sequenceOrder)
                .reverse();

        const r1Est =
          r1.timetableBasis === 'ESTIMATED_FREQUENCY' ||
          r1.timetableBasis === 'SYNTHETIC_DEMO' ||
          r1.timetableBasis === 'UNAVAILABLE';
        const r2Est =
          r2.timetableBasis === 'ESTIMATED_FREQUENCY' ||
          r2.timetableBasis === 'SYNTHETIC_DEMO' ||
          r2.timetableBasis === 'UNAVAILABLE';

        const initialWait = Math.max(3, Math.min(12, Math.round(r1.frequencyMin / 3)));

        options.push({
          optionId: `xfer_${r1.routeId}_${transferS1.stopId}_${r2.routeId}`,
          legs: [
            {
              routeId: r1.routeId,
              routeNumber: r1.routeNumber,
              operatorShortCode: opMap.get(r1.operatorId)?.shortCode ?? 'WBTC',
              fromStopId,
              toStopId: transferS1.stopId,
              intermediateStopIds: leg1Slice.map((s) => s.stopId),
              estimatedDurationMin: leg1Dur,
              scheduledDeparture: r1Est ? null : formatScheduledTimeOffset(nowDate, initialWait),
              timetableBasis: r1.timetableBasis,
              verification: v1,
              dataSource: v1.source,
            },
            {
              routeId: r2.routeId,
              routeNumber: r2.routeNumber,
              operatorShortCode: opMap.get(r2.operatorId)?.shortCode ?? 'WBTC',
              fromStopId: transferS1.stopId,
              toStopId,
              intermediateStopIds: leg2Slice.map((s) => s.stopId),
              estimatedDurationMin: leg2Dur,
              scheduledDeparture: r2Est
                ? null
                : formatScheduledTimeOffset(nowDate, initialWait + leg1Dur + transferWaitMin),
              timetableBasis: r2.timetableBasis,
              verification: v2,
              dataSource: v2.source,
            },
          ],
          totalDurationMin: leg1Dur + leg2Dur + transferWaitMin + Math.round(walkingMeters / 75),
          walkingDistanceMeters: walkingMeters + 65,
          transfers: 1,
          transferWaitMin,
          wheelchairAccessible: Boolean(
            fromStop?.wheelchairAccessible && transferStop?.wheelchairAccessible && toStop?.wheelchairAccessible
          ),
          usesDemoTelemetry: v1.source === 'SYNTHETIC_DEMO' || v2.source === 'SYNTHETIC_DEMO',
          usesScheduleOnly:
            v1.status === 'SCHEDULED' ||
            v2.status === 'SCHEDULED' ||
            v1.status === 'TRACKING_UNAVAILABLE' ||
            v2.status === 'TRACKING_UNAVAILABLE',
          usesEstimatedFrequency: r1Est || r2Est,
        });
        break;
      }
    }
  }

  return options
    .sort((a, b) => {
      const aCancel = a.legs.some((l) => l.verification.status === 'CANCELLED') ? 1 : 0;
      const bCancel = b.legs.some((l) => l.verification.status === 'CANCELLED') ? 1 : 0;
      if (aCancel !== bCancel) return aCancel - bCancel;
      if (a.transfers !== b.transfers) return a.transfers - b.transfers;
      return a.totalDurationMin - b.totalDurationMin;
    })
    .slice(0, 6);
}
