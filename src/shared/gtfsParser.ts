import type {
  AlertSeverity,
  AlertType,
  DataSourceType,
  FreshnessState,
  Operator,
  ScheduledTrip,
  ServiceAlert,
  StopTimeEntry,
  TimetableBasis,
  TransitRoute,
  TransitStop,
  TripUpdateRecord,
  VehiclePosition,
} from './types.ts';

export interface GtfsImportResult {
  ok: boolean;
  dryRun: boolean;
  summary: {
    operatorsCount: number;
    stopsCount: number;
    routesCount: number;
    tripsCount: number;
    stopTimesCount: number;
  };
  warnings: string[];
  errors: string[];
  parsedOperators: Operator[];
  parsedStops: TransitStop[];
  parsedRoutes: TransitRoute[];
  parsedTrips: ScheduledTrip[];
  parsedStopTimes: StopTimeEntry[];
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
  );
}

export function isWithinKolkataMetroBounds(lat: number, lng: number): boolean {
  return lat >= 22.15 && lat <= 23.15 && lng >= 87.95 && lng <= 88.85;
}

export function parseCsvRecords(csvText: string): Array<Record<string, string>> {
  const clean = csvText.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) record[h] = (cols[idx] ?? '').trim();
    });
    return record;
  });
}

function parseGtfsTimeToMinutes(timeStr: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm < 0 || mm > 59 || hh < 0 || hh > 48) {
    return null;
  }
  return hh * 60 + mm;
}

function normalizeHhMm(timeStr: string): string {
  const mins = parseGtfsTimeToMinutes(timeStr);
  if (mins === null) return '06:00';
  const hh = Math.floor((mins % 1440) / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function validateAndImportStaticGtfs(
  files: Record<string, string>,
  options: {
    dryRun?: boolean;
    sourceLabel?: string;
    sourceType?: DataSourceType;
    timetableBasis?: TimetableBasis;
    sourceUrl?: string;
  } = {}
): GtfsImportResult {
  const dryRun = Boolean(options.dryRun);
  const sourceType: DataSourceType = options.sourceType || 'OFFICIAL_VERIFIED';
  const timetableBasis: TimetableBasis = options.timetableBasis || 'OFFICIAL_TIMETABLE';
  const sourceLabel = options.sourceLabel?.trim() || 'Imported Static GTFS Feed';

  const errors: string[] = [];
  const warnings: string[] = [];

  const stopsCsv = files['stops.txt'] || files['stops'] || '';
  const routesCsv = files['routes.txt'] || files['routes'] || '';
  const tripsCsv = files['trips.txt'] || files['trips'] || '';
  const stopTimesCsv = files['stop_times.txt'] || files['stop_times'] || '';
  const agencyCsv = files['agency.txt'] || files['agency'] || '';
  const calendarCsv = files['calendar.txt'] || files['calendar'] || '';

  if (!stopsCsv.trim()) errors.push('Missing required GTFS file: stops.txt');
  if (!routesCsv.trim()) errors.push('Missing required GTFS file: routes.txt');
  if (!tripsCsv.trim()) errors.push('Missing required GTFS file: trips.txt');
  if (!stopTimesCsv.trim()) errors.push('Missing required GTFS file: stop_times.txt');

  if (errors.length > 0) {
    return {
      ok: false,
      dryRun,
      summary: { operatorsCount: 0, stopsCount: 0, routesCount: 0, tripsCount: 0, stopTimesCount: 0 },
      warnings,
      errors,
      parsedOperators: [],
      parsedStops: [],
      parsedRoutes: [],
      parsedTrips: [],
      parsedStopTimes: [],
    };
  }

  // 1. Parse agency.txt
  const agencyRows = parseCsvRecords(agencyCsv);
  const parsedOperators: Operator[] = agencyRows
    .filter((row) => row.agency_id || row.agency_name)
    .map((row, idx) => ({
      operatorId: row.agency_id || `agency_${idx + 1}`,
      name: row.agency_name || 'Public Bus Operator',
      shortCode: (row.agency_name || 'BUS')
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 8)
        .toUpperCase(),
      agencyType: 'STATE_UNDERTAKING',
      helpline: row.agency_phone || undefined,
      sourceUrl: row.agency_url || options.sourceUrl,
    }));

  if (parsedOperators.length === 0) {
    warnings.push('agency.txt missing or empty; defaulting imported routes to WBTC agency.');
    parsedOperators.push({
      operatorId: 'op_imported',
      name: sourceLabel,
      shortCode: 'GTFS',
      agencyType: 'STATE_UNDERTAKING',
      sourceUrl: options.sourceUrl,
    });
  }

  // 2. Parse stops.txt
  const stopRows = parseCsvRecords(stopsCsv);
  const stopIdSet = new Set<string>();
  const parsedStops: TransitStop[] = [];
  for (const row of stopRows) {
    const id = row.stop_id;
    const name = row.stop_name;
    const lat = Number(row.stop_lat);
    const lng = Number(row.stop_lon);

    if (!id || !name) {
      errors.push(`stops.txt row missing stop_id or stop_name`);
      continue;
    }
    if (stopIdSet.has(id)) {
      warnings.push(`Duplicate stop_id ignored in stops.txt: ${id}`);
      continue;
    }
    if (!isValidCoordinate(lat, lng)) {
      errors.push(`Invalid coordinates in stops.txt for stop ${id} (${row.stop_lat}, ${row.stop_lon})`);
      continue;
    }
    if (!isWithinKolkataMetroBounds(lat, lng)) {
      warnings.push(`Stop ${id} (${name}) lies outside Kolkata Metro bounds (${lat}, ${lng})`);
    }
    stopIdSet.add(id);
    parsedStops.push({
      stopId: id,
      name: { en: name, hi: name, bn: name },
      locality: {
        en: row.zone_id || row.stop_desc || 'Kolkata Metro',
        hi: row.zone_id || 'कोलकाता',
        bn: row.zone_id || 'কলকাতা',
      },
      lat,
      lng,
      zone: row.zone_id || 'Kolkata',
      isMajorHub: row.location_type === '1',
      wheelchairAccessible: row.wheelchair_boarding === '1',
      sourceType,
      sourceLabel,
    });
  }

  // 3. Parse calendar.txt
  const calendarRows = parseCsvRecords(calendarCsv);
  const calendarDaysByService = new Map<string, string[]>();
  for (const row of calendarRows) {
    if (!row.service_id) continue;
    const days: string[] = [];
    if (row.monday === '1') days.push('Mon');
    if (row.tuesday === '1') days.push('Tue');
    if (row.wednesday === '1') days.push('Wed');
    if (row.thursday === '1') days.push('Thu');
    if (row.friday === '1') days.push('Fri');
    if (row.saturday === '1') days.push('Sat');
    if (row.sunday === '1') days.push('Sun');
    calendarDaysByService.set(
      row.service_id,
      days.length > 0 ? days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    );
  }

  // 4. Parse trips.txt & stop_times.txt
  const tripRows = parseCsvRecords(tripsCsv);
  const stopTimeRows = parseCsvRecords(stopTimesCsv);
  const stopTimesByTrip = new Map<string, StopTimeEntry[]>();

  for (const row of stopTimeRows) {
    const tripId = row.trip_id;
    const stopId = row.stop_id;
    const seq = Number(row.stop_sequence);
    if (!tripId || !stopId || !Number.isFinite(seq)) {
      errors.push('stop_times.txt row missing trip_id, stop_id, or numeric stop_sequence');
      continue;
    }
    if (!stopIdSet.has(stopId)) {
      errors.push(`stop_times.txt references unknown stop_id: ${stopId}`);
      continue;
    }
    const arrStr = row.arrival_time || row.departure_time || '';
    const depStr = row.departure_time || row.arrival_time || '';
    if (parseGtfsTimeToMinutes(arrStr) === null || parseGtfsTimeToMinutes(depStr) === null) {
      errors.push(`Invalid HH:MM(:SS) time in stop_times.txt for trip ${tripId}, stop ${stopId}`);
      continue;
    }
    const list = stopTimesByTrip.get(tripId) ?? [];
    list.push({
      stopTimeId: `st_${tripId}_${seq}`,
      tripId,
      stopId,
      stopSequence: seq,
      scheduledArrival: normalizeHhMm(arrStr),
      scheduledDeparture: normalizeHhMm(depStr),
    });
    stopTimesByTrip.set(tripId, list);
  }

  // Validate chronological consistency per trip
  const parsedStopTimes: StopTimeEntry[] = [];
  for (const [tripId, entries] of stopTimesByTrip.entries()) {
    entries.sort((a, b) => a.stopSequence - b.stopSequence);
    let prevMin = -1;
    for (const entry of entries) {
      const m = parseGtfsTimeToMinutes(entry.scheduledDeparture) ?? 0;
      if (m < prevMin) {
        warnings.push(`Non-monotonic departure time detected on trip ${tripId} at stop ${entry.stopId}`);
      }
      prevMin = m;
      parsedStopTimes.push(entry);
    }
  }

  // 5. Parse routes.txt and stitch stop sequences from representative trips
  const routeRows = parseCsvRecords(routesCsv);
  const routeIdSet = new Set<string>();
  const parsedTrips: ScheduledTrip[] = [];
  const tripsByRoute = new Map<string, ScheduledTrip[]>();

  for (const row of tripRows) {
    const tripId = row.trip_id;
    const routeId = row.route_id;
    if (!tripId || !routeId) continue;
    const entries = stopTimesByTrip.get(tripId) ?? [];
    if (entries.length < 2) {
      warnings.push(`Trip ${tripId} has fewer than 2 stop_times entries and was skipped.`);
      continue;
    }
    const first = entries[0];
    const last = entries[entries.length - 1];
    const operatingDays =
      calendarDaysByService.get(row.service_id) ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const trip: ScheduledTrip = {
      tripId,
      routeId,
      direction: row.direction_id === '1' ? 'INBOUND' : 'OUTBOUND',
      headsign: {
        en: row.trip_headsign || last.stopId,
        hi: row.trip_headsign || last.stopId,
        bn: row.trip_headsign || last.stopId,
      },
      departureTime: first.scheduledDeparture,
      arrivalTime: last.scheduledArrival,
      operatingDays,
      isEstimated: timetableBasis === 'ESTIMATED_FREQUENCY' || timetableBasis === 'SYNTHETIC_DEMO',
      timetableBasis,
    };
    parsedTrips.push(trip);
    const list = tripsByRoute.get(routeId) ?? [];
    list.push(trip);
    tripsByRoute.set(routeId, list);
  }

  const stopsMap = new Map(parsedStops.map((s) => [s.stopId, s]));
  const parsedRoutes: TransitRoute[] = [];
  const now = Date.now();

  for (const row of routeRows) {
    const routeId = row.route_id;
    const routeNum = row.route_short_name || row.route_long_name || routeId;
    if (!routeId) continue;
    if (routeIdSet.has(routeId)) {
      warnings.push(`Duplicate route_id ignored in routes.txt: ${routeId}`);
      continue;
    }
    routeIdSet.add(routeId);

    const routeTrips = (tripsByRoute.get(routeId) ?? []).sort((a, b) =>
      a.departureTime.localeCompare(b.departureTime)
    );
    if (routeTrips.length === 0) {
      warnings.push(`Route ${routeNum} (${routeId}) has no valid trips in trips.txt / stop_times.txt.`);
      continue;
    }

    const repTrip = routeTrips[0];
    const repStops = stopTimesByTrip.get(repTrip.tripId) ?? [];
    const firstStop = stopsMap.get(repStops[0].stopId);
    const lastStop = stopsMap.get(repStops[repStops.length - 1].stopId);
    const firstDepMin = parseGtfsTimeToMinutes(repStops[0].scheduledDeparture) ?? 360;

    const stopSequence = repStops.map((st, idx) => {
      const curMin = parseGtfsTimeToMinutes(st.scheduledDeparture) ?? firstDepMin;
      return {
        routeId,
        stopId: st.stopId,
        sequenceOrder: idx + 1,
        distanceFromOriginKm: Number((idx * 2.1).toFixed(1)),
        scheduledOffsetMin: Math.max(0, curMin - firstDepMin),
      };
    });

    const uniqueDays = Array.from(new Set(routeTrips.flatMap((t) => t.operatingDays)));
    let freqMin = 20;
    if (routeTrips.length >= 2) {
      const t1 = parseGtfsTimeToMinutes(routeTrips[0].departureTime) ?? 0;
      const t2 = parseGtfsTimeToMinutes(routeTrips[1].departureTime) ?? 0;
      if (t2 > t1) freqMin = Math.max(5, Math.min(120, t2 - t1));
    }

    parsedRoutes.push({
      routeId,
      routeNumber: routeNum,
      operatorId: row.agency_id || parsedOperators[0].operatorId,
      origin: firstStop?.name ?? { en: routeNum, hi: routeNum, bn: routeNum },
      destination: lastStop?.name ?? { en: 'Terminus', hi: 'टर्मिनस', bn: 'টার্মিনাস' },
      corridorSummary: {
        en: row.route_long_name || `${firstStop?.name.en ?? ''} to ${lastStop?.name.en ?? ''}`,
        hi: row.route_long_name || `${firstStop?.name.hi ?? ''} से ${lastStop?.name.hi ?? ''}`,
        bn: row.route_long_name || `${firstStop?.name.bn ?? ''} থেকে ${lastStop?.name.bn ?? ''}`,
      },
      operatingDays: uniqueDays,
      firstDeparture: routeTrips[0].departureTime,
      lastDeparture: routeTrips[routeTrips.length - 1].departureTime,
      frequencyMin: freqMin,
      fareMinInr: 10,
      fareMaxInr: 35,
      isAc: /ac|volvo|electric|ev/i.test(`${routeNum} ${row.route_long_name || ''}`),
      active: true,
      dataSource: sourceType,
      timetableBasis,
      sourceLabel,
      sourceUrl: options.sourceUrl,
      lastVerifiedAt: now,
      stopSequence,
    });
  }

  if (parsedRoutes.length === 0) {
    errors.push('No valid routes with stop sequences could be constructed from the GTFS package.');
  }

  return {
    ok: errors.length === 0,
    dryRun,
    summary: {
      operatorsCount: parsedOperators.length,
      stopsCount: parsedStops.length,
      routesCount: parsedRoutes.length,
      tripsCount: parsedTrips.length,
      stopTimesCount: parsedStopTimes.length,
    },
    warnings,
    errors,
    parsedOperators,
    parsedStops,
    parsedRoutes,
    parsedTrips,
    parsedStopTimes,
  };
}

export function classifyFreshnessState(
  observationTimestamp: number | null,
  now: number,
  forcedStale?: boolean
): FreshnessState {
  if (forcedStale || observationTimestamp === null || !Number.isFinite(observationTimestamp)) {
    return 'UNAVAILABLE';
  }
  const ageSec = Math.max(0, Math.round((now - observationTimestamp) / 1000));
  if (ageSec <= 90) return 'FRESH';
  if (ageSec <= 180) return 'DELAYED_UPDATE';
  return 'STALE';
}

function normalizeEpochMs(rawTs: unknown, fallbackMs: number): number | null {
  if (typeof rawTs !== 'number' || !Number.isFinite(rawTs) || rawTs <= 0) {
    return Number.isFinite(fallbackMs) && fallbackMs > 0 ? fallbackMs : null;
  }
  // GTFS-RT timestamps are typically UNIX seconds (~1.7e9); JS uses ms (~1.7e12)
  return rawTs < 1e11 ? rawTs * 1000 : rawTs;
}

export function parseGtfsRtVehiclePositions(
  payload: unknown,
  routesMap: Map<string, TransitRoute>,
  now: number,
  sourceType: DataSourceType = 'OFFICIAL_VERIFIED'
): { positions: VehiclePosition[]; rejectedCount: number } {
  const positions: VehiclePosition[] = [];
  const seenVehicleIds = new Set<string>();
  let rejectedCount = 0;

  if (!payload || typeof payload !== 'object') {
    return { positions, rejectedCount: 1 };
  }

  const obj = payload as Record<string, unknown>;
  const headerTs =
    obj.header && typeof obj.header === 'object'
      ? normalizeEpochMs((obj.header as Record<string, unknown>).timestamp, 0)
      : null;

  // Format A: Standard GTFS-RT JSON ({ entity: [...] })
  if (Array.isArray(obj.entity)) {
    for (const rawEnt of obj.entity) {
      if (!rawEnt || typeof rawEnt !== 'object') {
        rejectedCount++;
        continue;
      }
      const ent = rawEnt as Record<string, unknown>;
      const vp = (ent.vehicle ?? ent) as Record<string, unknown>;
      const pos = vp.position as Record<string, unknown> | undefined;
      const trip = vp.trip as Record<string, unknown> | undefined;
      const veh = vp.vehicle as Record<string, unknown> | undefined;

      const vehicleId = String(veh?.id || ent.id || vp.vehicleId || '').trim();
      const routeId = String(trip?.route_id || trip?.routeId || vp.routeId || '').trim();
      const lat = Number(pos?.latitude ?? vp.lat);
      const lng = Number(pos?.longitude ?? vp.lng);

      if (!vehicleId || !routeId || !isValidCoordinate(lat, lng)) {
        rejectedCount++;
        continue;
      }
      if (seenVehicleIds.has(vehicleId)) {
        rejectedCount++;
        continue;
      }

      const obsTs = normalizeEpochMs(vp.timestamp, headerTs ?? 0);
      if (!obsTs) {
        rejectedCount++;
        continue;
      }

      seenVehicleIds.add(vehicleId);
      const route = routesMap.get(routeId);
      const seq = Number(vp.current_stop_sequence ?? vp.currentStopSequence ?? 1);
      const nextStopId =
        String(vp.stop_id || vp.nextStopId || '') ||
        route?.stopSequence.find((s) => s.sequenceOrder >= seq)?.stopId ||
        route?.stopSequence[0]?.stopId ||
        '';
      const speedRaw = Number(pos?.speed ?? vp.speedKmh ?? 0);
      // GTFS-RT position.speed is m/s; convert if plausible m/s or accept km/h if provided as speedKmh
      const speedKmh =
        pos?.speed !== undefined && Number.isFinite(Number(pos.speed))
          ? Number((Number(pos.speed) * 3.6).toFixed(1))
          : Number.isFinite(speedRaw)
            ? Number(speedRaw.toFixed(1))
            : 0;

      positions.push({
        vehicleId,
        routeId,
        tripId: String(trip?.trip_id || trip?.tripId || `trip_${routeId}`),
        direction: trip?.direction_id === 1 ? 'INBOUND' : 'OUTBOUND',
        lat,
        lng,
        bearing: Number.isFinite(Number(pos?.bearing ?? vp.bearing))
          ? Math.round(Number(pos?.bearing ?? vp.bearing))
          : 0,
        speedKmh: Math.max(0, Math.min(110, speedKmh)),
        currentStopSequence: Number.isFinite(seq) ? seq : 1,
        nextStopId,
        lastGpsTimestamp: obsTs,
        observationTimestamp: obsTs,
        ingestedAt: now,
        sourceType,
        delayMinutes: Number.isFinite(Number(vp.delayMinutes)) ? Number(vp.delayMinutes) : 0,
        freshnessState: classifyFreshnessState(obsTs, now),
      });
    }
    return { positions, rejectedCount };
  }

  // Format B: Simplified JSON feed ({ vehicles: [...] })
  if (Array.isArray(obj.vehicles)) {
    for (const rawV of obj.vehicles) {
      if (!rawV || typeof rawV !== 'object') {
        rejectedCount++;
        continue;
      }
      const v = rawV as Record<string, unknown>;
      const vehicleId = String(v.vehicleId || '').trim();
      const routeId = String(v.routeId || '').trim();
      const lat = Number(v.lat);
      const lng = Number(v.lng);
      const obsTs = normalizeEpochMs(v.observationTimestamp ?? v.lastGpsTimestamp, headerTs ?? 0);

      if (!vehicleId || !routeId || !isValidCoordinate(lat, lng) || !obsTs) {
        rejectedCount++;
        continue;
      }
      if (seenVehicleIds.has(vehicleId)) {
        rejectedCount++;
        continue;
      }
      seenVehicleIds.add(vehicleId);
      positions.push({
        vehicleId,
        routeId,
        tripId: String(v.tripId || `trip_${routeId}`),
        direction: v.direction === 'INBOUND' ? 'INBOUND' : 'OUTBOUND',
        lat,
        lng,
        bearing: Number.isFinite(Number(v.bearing)) ? Number(v.bearing) : 0,
        speedKmh: Number.isFinite(Number(v.speedKmh)) ? Math.max(0, Number(v.speedKmh)) : 0,
        currentStopSequence: Number.isFinite(Number(v.currentStopSequence))
          ? Number(v.currentStopSequence)
          : 1,
        nextStopId: String(v.nextStopId || ''),
        lastGpsTimestamp: obsTs,
        observationTimestamp: obsTs,
        ingestedAt: now,
        sourceType,
        delayMinutes: Number.isFinite(Number(v.delayMinutes)) ? Number(v.delayMinutes) : 0,
        freshnessState: classifyFreshnessState(obsTs, now),
      });
    }
    return { positions, rejectedCount };
  }

  return { positions, rejectedCount: 1 };
}

export function parseGtfsRtTripUpdates(
  payload: unknown,
  now: number,
  sourceType: DataSourceType = 'OFFICIAL_VERIFIED'
): { tripUpdates: TripUpdateRecord[]; rejectedCount: number } {
  const tripUpdates: TripUpdateRecord[] = [];
  const seenTrips = new Set<string>();
  let rejectedCount = 0;

  if (!payload || typeof payload !== 'object') {
    return { tripUpdates, rejectedCount: 1 };
  }

  const obj = payload as Record<string, unknown>;
  const entities = Array.isArray(obj.entity)
    ? obj.entity
    : Array.isArray(obj.tripUpdates)
      ? obj.tripUpdates
      : [];

  for (const raw of entities) {
    if (!raw || typeof raw !== 'object') {
      rejectedCount++;
      continue;
    }
    const ent = raw as Record<string, unknown>;
    const tu = (ent.trip_update ?? ent.tripUpdate ?? ent) as Record<string, unknown>;
    const trip = (tu.trip ?? {}) as Record<string, unknown>;
    const tripId = String(trip.trip_id || tu.tripId || ent.id || '').trim();
    const routeId = String(trip.route_id || tu.routeId || '').trim();
    if (!tripId || !routeId || seenTrips.has(tripId)) {
      rejectedCount++;
      continue;
    }
    seenTrips.add(tripId);
    const obsTs = normalizeEpochMs(tu.timestamp, now) ?? now;
    const rawRel = String(trip.schedule_relationship || tu.scheduleRelationship || 'SCHEDULED').toUpperCase();
    const scheduleRelationship =
      rawRel === 'CANCELED' || rawRel === 'CANCELLED'
        ? 'CANCELED'
        : rawRel === 'ADDED'
          ? 'ADDED'
          : rawRel === 'SKIPPED'
            ? 'SKIPPED'
            : 'SCHEDULED';

    const stuRaw = Array.isArray(tu.stop_time_update)
      ? tu.stop_time_update
      : Array.isArray(tu.stopTimeUpdates)
        ? tu.stopTimeUpdates
        : [];
    const stopTimeUpdates = stuRaw
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
      .map((s) => {
        const arr = (s.arrival ?? {}) as Record<string, unknown>;
        const dep = (s.departure ?? {}) as Record<string, unknown>;
        return {
          stopId: String(s.stop_id || s.stopId || ''),
          stopSequence: Number.isFinite(Number(s.stop_sequence ?? s.stopSequence))
            ? Number(s.stop_sequence ?? s.stopSequence)
            : undefined,
          arrivalDelaySec: Number.isFinite(Number(arr.delay ?? s.arrivalDelaySec))
            ? Number(arr.delay ?? s.arrivalDelaySec)
            : undefined,
          departureDelaySec: Number.isFinite(Number(dep.delay ?? s.departureDelaySec))
            ? Number(dep.delay ?? s.departureDelaySec)
            : undefined,
          arrivalTimeEpoch: normalizeEpochMs(arr.time, 0) ?? undefined,
        };
      });

    const delaySeconds = Number.isFinite(Number(tu.delay ?? tu.delaySeconds))
      ? Number(tu.delay ?? tu.delaySeconds)
      : stopTimeUpdates[0]?.arrivalDelaySec ?? 0;

    tripUpdates.push({
      tripId,
      routeId,
      vehicleId: tu.vehicle && typeof tu.vehicle === 'object'
        ? String((tu.vehicle as Record<string, unknown>).id || '') || undefined
        : typeof tu.vehicleId === 'string'
          ? tu.vehicleId
          : undefined,
      delaySeconds,
      scheduleRelationship,
      stopTimeUpdates,
      observationTimestamp: obsTs,
      ingestedAt: now,
      sourceType,
    });
  }

  return { tripUpdates, rejectedCount };
}

function mapAlertCauseToType(causeOrEffect: string): AlertType {
  const s = causeOrEffect.toUpperCase();
  if (s.includes('NO_SERVICE') || s.includes('CANCEL')) return 'CANCELLATION';
  if (s.includes('PARTIAL')) return 'PARTIAL_CANCELLATION';
  if (s.includes('DETOUR') || s.includes('DIVERSION')) return 'DIVERSION';
  if (s.includes('WEATHER') || s.includes('STORM') || s.includes('RAIN')) return 'WEATHER_DISRUPTION';
  if (s.includes('TRAFFIC') || s.includes('CONGESTION')) return 'TRAFFIC_CONGESTION';
  if (s.includes('BREAKDOWN') || s.includes('MAINTENANCE')) return 'BREAKDOWN';
  if (s.includes('SUSPEND')) return 'ROUTE_SUSPENSION';
  if (s.includes('SPECIAL') || s.includes('MODIFIED')) return 'SPECIAL_SERVICE';
  return 'DELAY';
}

export function parseGtfsRtAlerts(
  payload: unknown,
  now: number,
  sourceUrl?: string
): { alerts: ServiceAlert[]; rejectedCount: number } {
  const alerts: ServiceAlert[] = [];
  const seenIds = new Set<string>();
  let rejectedCount = 0;

  if (!payload || typeof payload !== 'object') {
    return { alerts, rejectedCount: 1 };
  }

  const obj = payload as Record<string, unknown>;
  const entities = Array.isArray(obj.entity)
    ? obj.entity
    : Array.isArray(obj.alerts)
      ? obj.alerts
      : [];

  for (const raw of entities) {
    if (!raw || typeof raw !== 'object') {
      rejectedCount++;
      continue;
    }
    const ent = raw as Record<string, unknown>;
    const al = (ent.alert ?? ent) as Record<string, unknown>;
    const alertId = String(ent.id || al.alertId || '').trim();
    if (!alertId || seenIds.has(alertId)) {
      rejectedCount++;
      continue;
    }
    seenIds.add(alertId);

    const informed = Array.isArray(al.informed_entity)
      ? (al.informed_entity as Array<Record<string, unknown>>)
      : [];
    const routeId = String(
      al.routeId || informed.find((i) => i.route_id)?.route_id || ''
    ).trim();
    const stopIds = informed
      .map((i) => String(i.stop_id || '').trim())
      .filter(Boolean);

    const headerObj = (al.header_text ?? {}) as Record<string, unknown>;
    const descObj = (al.description_text ?? {}) as Record<string, unknown>;
    const headerTranslations = Array.isArray(headerObj.translation)
      ? (headerObj.translation as Array<Record<string, unknown>>)
      : [];
    const descTranslations = Array.isArray(descObj.translation)
      ? (descObj.translation as Array<Record<string, unknown>>)
      : [];

    const titleEn = String(
      headerTranslations[0]?.text || al.titleEn || al.title || 'Service Alert'
    ).slice(0, 160);
    const descEn = String(
      descTranslations[0]?.text || al.descriptionEn || al.description || 'Check operator advisory.'
    ).slice(0, 600);

    const alertType = mapAlertCauseToType(`${al.effect || ''} ${al.cause || ''} ${al.alertType || ''}`);
    const severity: AlertSeverity =
      alertType === 'CANCELLATION' || alertType === 'ROUTE_SUSPENSION'
        ? 'CRITICAL'
        : alertType === 'SPECIAL_SERVICE'
          ? 'INFO'
          : 'WARNING';

    alerts.push({
      alertId,
      routeId: routeId || 'ALL',
      affectedStopIds: stopIds,
      alertType,
      severity,
      title: { en: titleEn, hi: titleEn, bn: titleEn },
      description: { en: descEn, hi: descEn, bn: descEn },
      sourceType: 'OFFICIAL_VERIFIED',
      issuingOrganization: String(al.issuingOrganization || 'Official GTFS-RT Alert Feed'),
      verifiedByAdmin: true,
      active: true,
      startTime: now,
      publicationTime: now,
      lastUpdatedTime: now,
      sourceUrl,
      createdAt: now,
    });
  }

  return { alerts, rejectedCount };
}
