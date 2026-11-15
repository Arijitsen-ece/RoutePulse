import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createInitialServiceAlerts,
  createInitialVehiclePositions,
  generateDailyTripsForRoutes,
  INITIAL_OPERATORS,
  INITIAL_ROUTES,
  INITIAL_STOPS,
  INITIAL_VEHICLES,
} from '../shared/kolkataTransitData.ts';
import type {
  FeedEndpointHealth,
  ServiceStatusVerification,
  TransitSnapshot,
  TransitStop,
} from '../shared/types.ts';
import { haversineKm, verifyRouteServiceStatus } from '../shared/verificationEngine.ts';

export interface UserLocationState {
  label: string;
  lat: number;
  lng: number;
  mode: 'GPS' | 'MANUAL';
}

interface TransitContextValue {
  snapshot: TransitSnapshot;
  loading: boolean;
  offline: boolean;
  wsConnected: boolean;
  verificationsByRoute: Map<string, ServiceStatusVerification>;
  stopsMap: Map<string, TransitStop>;
  userLocation: UserLocationState;
  nearbyStops: Array<{ stop: TransitStop; distanceKm: number }>;
  setManualLocation: (stop: TransitStop) => void;
  requestGpsLocation: () => Promise<boolean>;
  refreshSnapshot: () => Promise<void>;
}

const TransitContext = createContext<TransitContextValue | null>(null);

const DEFAULT_LOCATION: UserLocationState = {
  label: 'Esplanade (Dharmatala)',
  lat: 22.5648,
  lng: 88.3516,
  mode: 'MANUAL',
};

function createUnconfiguredEndpointHealth(): FeedEndpointHealth {
  return {
    configured: false,
    urlMasked: null,
    status: 'UNCONFIGURED',
    lastSuccessfulFetch: null,
    lastFailedFetch: null,
    lastError: null,
    consecutiveFailures: 0,
    nextRetryAt: null,
    entityCount: 0,
  };
}

function createFallbackSnapshot(): TransitSnapshot {
  const now = Date.now();
  return {
    operators: INITIAL_OPERATORS,
    stops: INITIAL_STOPS,
    routes: INITIAL_ROUTES,
    scheduledTrips: generateDailyTripsForRoutes(INITIAL_ROUTES),
    vehicles: INITIAL_VEHICLES,
    vehiclePositions: createInitialVehiclePositions(now),
    tripUpdates: [],
    serviceAlerts: createInitialServiceAlerts(now),
    passengerReports: [],
    dataHealth: {
      gtfsStaticLoaded: true,
      gtfsStaticLastSync: now,
      gtfsRtFeedConfigured: false,
      gtfsRtFeedUrlMasked: null,
      officialStaticFeedConnected: false,
      officialTripUpdatesConnected: false,
      officialAlertFeedConnected: false,
      activeTelemetryMode: 'SYNTHETIC_DEMO',
      pollIntervalMs: 30000,
      freshVehiclesCount: 0,
      staleVehiclesCount: 0,
      totalRoutes: INITIAL_ROUTES.length,
      totalStops: INITIAL_STOPS.length,
      pendingReportsCount: 0,
      activeAlertsCount: 0,
      lastTickAt: now,
      vehicleFeedHealth: createUnconfiguredEndpointHealth(),
      tripUpdatesFeedHealth: createUnconfiguredEndpointHealth(),
      alertsFeedHealth: createUnconfiguredEndpointHealth(),
      staticFeedHealth: createUnconfiguredEndpointHealth(),
      fcmHealth: {
        configured: false,
        credentialMode: 'UNCONFIGURED',
        vapidConfigured: false,
        registeredTokensCount: 0,
        sentCount: 0,
        failedCount: 0,
        prunedTokensCount: 0,
        lastSentAt: null,
        lastError: null,
      },
      dataQuality: {
        totalRoutes: INITIAL_ROUTES.length,
        totalStops: INITIAL_STOPS.length,
        totalTrips: 0,
        officialTimetableRoutesCount: 0,
        estimatedFrequencyRoutesCount: INITIAL_ROUTES.length,
        officialVerifiedPercent: 0,
        stopsWithinKolkataBoundsCount: INITIAL_STOPS.length,
        stopsOutOfBoundsCount: 0,
        freshVehiclesCount: 0,
        delayedVehiclesCount: 0,
        staleVehiclesCount: 0,
        unavailableVehiclesCount: 0,
        lastValidatedAt: now,
        warnings: [
          'Offline/fallback snapshot: estimated frequencies and demonstration telemetry active.',
        ],
      },
    },
    serverTimestamp: now,
  };
}

export function TransitProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<TransitSnapshot>(() => createFallbackSnapshot());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocationState>(() => {
    try {
      const saved = localStorage.getItem('routepulse_location');
      return saved ? (JSON.parse(saved) as UserLocationState) : DEFAULT_LOCATION;
    } catch {
      return DEFAULT_LOCATION;
    }
  });

  const refreshSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/transit/snapshot');
      if (!res.ok) throw new Error('Snapshot request failed');
      const data = (await res.json()) as { snapshot: TransitSnapshot };
      setSnapshot(data.snapshot);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSnapshot();
  }, [refreshSnapshot]);

  // Connect WebSocket for live server-authoritative updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        setOffline(false);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            type: string;
            data?: TransitSnapshot;
          };
          if (parsed.type === 'transit:snapshot' && parsed.data) {
            setSnapshot(parsed.data);
            setLoading(false);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const stopsMap = useMemo(
    () => new Map(snapshot.stops.map((s) => [s.stopId, s])),
    [snapshot.stops]
  );

  const verificationsByRoute = useMemo(() => {
    const map = new Map<string, ServiceStatusVerification>();
    for (const route of snapshot.routes) {
      map.set(
        route.routeId,
        verifyRouteServiceStatus({
          route,
          positions: snapshot.vehiclePositions,
          alerts: snapshot.serviceAlerts,
          reports: snapshot.passengerReports,
          tripUpdates: snapshot.tripUpdates,
          now: snapshot.serverTimestamp,
        })
      );
    }
    return map;
  }, [snapshot]);

  const nearbyStops = useMemo(() => {
    return snapshot.stops
      .map((stop) => ({
        stop,
        distanceKm: Number(haversineKm(userLocation.lat, userLocation.lng, stop.lat, stop.lng).toFixed(2)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 6);
  }, [snapshot.stops, userLocation]);

  const setManualLocation = (stop: TransitStop) => {
    const next: UserLocationState = {
      label: stop.name.en,
      lat: stop.lat,
      lng: stop.lng,
      mode: 'MANUAL',
    };
    setUserLocation(next);
    localStorage.setItem('routepulse_location', JSON.stringify(next));
  };

  const requestGpsLocation = async (): Promise<boolean> => {
    if (!('geolocation' in navigator)) return false;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: UserLocationState = {
            label: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            mode: 'GPS',
          };
          setUserLocation(next);
          localStorage.setItem('routepulse_location', JSON.stringify(next));
          resolve(true);
        },
        () => resolve(false),
        { enableHighAccuracy: false, timeout: 6000 }
      );
    });
  };

  return (
    <TransitContext.Provider
      value={{
        snapshot,
        loading,
        offline,
        wsConnected,
        verificationsByRoute,
        stopsMap,
        userLocation,
        nearbyStops,
        setManualLocation,
        requestGpsLocation,
        refreshSnapshot,
      }}
    >
      {children}
    </TransitContext.Provider>
  );
}

export function useTransit() {
  const ctx = useContext(TransitContext);
  if (!ctx) throw new Error('useTransit must be used inside TransitProvider');
  return ctx;
}
