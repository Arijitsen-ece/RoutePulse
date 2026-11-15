import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ServiceStatusVerification,
  SupportedLanguage,
  TransitRoute,
  TransitStop,
  Vehicle,
  VehiclePosition,
} from '../shared/types.ts';

interface TransitMapProps {
  routes: TransitRoute[];
  stops: TransitStop[];
  vehicles: Vehicle[];
  vehiclePositions: VehiclePosition[];
  verificationsByRoute: Map<string, ServiceStatusVerification>;
  selectedRouteId: string | 'ALL';
  userLat: number;
  userLng: number;
  heightClass?: string;
  onSelectRoute?: (routeId: string) => void;
  onSelectStop?: (stopId: string) => void;
}

const ROUTE_LINE_COLORS: Record<string, string> = {
  OPERATING: '#0D9488',
  DELAYED: '#D97706',
  CANCELLED: '#DC2626',
  TRACKING_UNAVAILABLE: '#64748B',
  SCHEDULED: '#0B1F3A',
  UNVERIFIED: '#7C3AED',
};

export function TransitMap({
  routes,
  stops,
  vehicles,
  vehiclePositions,
  verificationsByRoute,
  selectedRouteId,
  userLat,
  userLng,
  heightClass = 'h-[420px] lg:h-[560px]',
  onSelectRoute,
  onSelectStop,
}: TransitMapProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFitRouteRef = useRef<string | null>(null);
  const lastBoundsRef = useRef<Array<[number, number]>>([]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [22.558, 88.368],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Re-render routes, stops, user pin, and live vehicle markers when snapshot or filter changes
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const stopsMap = new Map(stops.map((s) => [s.stopId, s]));
    const routesMap = new Map(routes.map((r) => [r.routeId, r]));
    const vehiclesMap = new Map(vehicles.map((v) => [v.vehicleId, v]));

    const visibleRoutes =
      selectedRouteId === 'ALL'
        ? routes
        : routes.filter((r) => r.routeId === selectedRouteId);

    const boundsCoords: Array<[number, number]> = [];

    // 1. Draw route polylines (completed emerald + remaining navy when inspecting a single active route)
    for (const route of visibleRoutes) {
      const coords: Array<[number, number]> = [];
      for (const entry of route.stopSequence) {
        const stop = stopsMap.get(entry.stopId);
        if (stop) {
          coords.push([stop.lat, stop.lng]);
          boundsCoords.push([stop.lat, stop.lng]);
        }
      }
      if (coords.length < 2) continue;

      const verification = verificationsByRoute.get(route.routeId);
      const status = verification?.status ?? 'SCHEDULED';
      const color = ROUTE_LINE_COLORS[status] || '#0B1F3A';
      const isDashed = status === 'TRACKING_UNAVAILABLE' || status === 'SCHEDULED';

      const activeVehicle =
        selectedRouteId !== 'ALL'
          ? vehiclePositions.find((vp) => vp.routeId === route.routeId)
          : undefined;

      if (activeVehicle && !isDashed) {
        const splitIdx = Math.max(
          0,
          route.stopSequence.findIndex((s) => s.sequenceOrder >= activeVehicle.currentStopSequence)
        );
        const completedCoords = coords.slice(0, Math.min(coords.length, splitIdx + 1));
        if (completedCoords.length >= 1) {
          const pastLine = L.polyline([...completedCoords, [activeVehicle.lat, activeVehicle.lng]], {
            color: '#16A34A',
            weight: 5,
            opacity: 0.95,
          });
          pastLine.addTo(group);
        }
        const remainingCoords = coords.slice(splitIdx);
        if (remainingCoords.length >= 1) {
          const aheadLine = L.polyline([[activeVehicle.lat, activeVehicle.lng], ...remainingCoords], {
            color: '#0B1F3A',
            weight: 5,
            opacity: 0.9,
          });
          aheadLine.addTo(group);
        }
      } else {
        const polyline = L.polyline(coords, {
          color,
          weight: selectedRouteId === 'ALL' ? 3 : 5,
          opacity: selectedRouteId === 'ALL' ? 0.65 : 0.9,
          dashArray: isDashed ? '6 6' : undefined,
        });

        polyline.on('click', () => {
          onSelectRoute?.(route.routeId);
        });

        polyline.addTo(group);
      }
    }

    // 2. Draw stops
    const stopIdsToDraw = new Set<string>();
    if (selectedRouteId === 'ALL') {
      stops.forEach((s) => stopIdsToDraw.add(s.stopId));
    } else {
      visibleRoutes.forEach((r) => r.stopSequence.forEach((entry) => stopIdsToDraw.add(entry.stopId)));
    }

    for (const stopId of stopIdsToDraw) {
      const stop = stopsMap.get(stopId);
      if (!stop) continue;

      const marker = L.circleMarker([stop.lat, stop.lng], {
        radius: stop.isMajorHub ? 6 : 4,
        color: '#0B1F3A',
        weight: 2,
        fillColor: '#FFFFFF',
        fillOpacity: 1,
      });

      const stopName = stop.name[lang] || stop.name.en;
      const locality = stop.locality[lang] || stop.locality.en;
      marker.bindPopup(
        `<div class="text-xs leading-snug">
          <div class="font-semibold text-slate-900">${stopName}</div>
          <div class="text-slate-500 mt-0.5">${locality} · ${stop.zone}</div>
        </div>`
      );
      marker.on('click', () => {
        onSelectStop?.(stop.stopId);
      });
      marker.addTo(group);
    }

    // 3. Draw user location pin
    const userMarker = L.circleMarker([userLat, userLng], {
      radius: 7,
      color: '#FFFFFF',
      weight: 2.5,
      fillColor: '#2563EB',
      fillOpacity: 1,
    });
    userMarker.bindPopup(`<div class="text-xs font-medium text-slate-900">${t('dashboard.currentLocation')}</div>`);
    userMarker.addTo(group);

    // 4. Draw live / stale vehicle markers
    const visiblePositions =
      selectedRouteId === 'ALL'
        ? vehiclePositions
        : vehiclePositions.filter((vp) => vp.routeId === selectedRouteId);

    const now = Date.now();
    for (const pos of visiblePositions) {
      const route = routesMap.get(pos.routeId);
      if (!route) continue;
      const verification = verificationsByRoute.get(pos.routeId);
      const status = verification?.status ?? 'OPERATING';
      const vehicle = vehiclesMap.get(pos.vehicleId);
      const nextStop = stopsMap.get(pos.nextStopId);
      const obsTs = pos.observationTimestamp || pos.lastGpsTimestamp;
      const ageSec = Math.max(0, Math.round((now - obsTs) / 1000));

      const bgColor =
        status === 'CANCELLED'
          ? '#DC2626'
          : status === 'TRACKING_UNAVAILABLE'
            ? '#64748B'
            : status === 'DELAYED'
              ? '#D97706'
              : '#0D9488';

      const icon = L.divIcon({
        className: 'routepulse-bus-marker',
        html: `<div style="display:flex;align-items:center;gap:4px;background:${bgColor};color:#ffffff;padding:3px 7px;border-radius:8px;border:2px solid #ffffff;box-shadow:0 3px 10px rgba(15,23,42,0.28);font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;white-space:nowrap;">
          <span>${route.routeNumber}</span>
          <span style="display:inline-block;transform:rotate(${pos.bearing}deg);font-size:10px;">▲</span>
        </div>`,
        iconSize: [58, 26],
        iconAnchor: [29, 13],
      });

      const marker = L.marker([pos.lat, pos.lng], { icon });
      const nextStopName = nextStop ? nextStop.name[lang] || nextStop.name.en : pos.nextStopId;
      const ageText =
        ageSec < 60
          ? t('map.secondsAgo', { sec: ageSec })
          : t('map.minutesAgo', { min: Math.round(ageSec / 60) });

      marker.bindPopup(
        `<div class="text-xs space-y-1 min-w-[180px]">
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-slate-900">${route.routeNumber}</span>
            <span class="font-semibold" style="color:${bgColor}">${t(`status.${status}`)}</span>
          </div>
          <div class="text-slate-600">${vehicle?.fleetCode ?? pos.vehicleId} · ${vehicle?.registrationNumber ?? ''}</div>
          <div class="text-slate-700"><strong>${t('map.nextStop')}:</strong> ${nextStopName}</div>
          <div class="text-slate-600"><strong>${t('map.speed')}:</strong> ${pos.speedKmh} km/h · <strong>${t('map.lastGps')}:</strong> ${ageText}</div>
          <div class="text-[11px] text-slate-500 pt-0.5 border-t border-slate-100">${t(`sources.${pos.sourceType}`)}</div>
        </div>`
      );
      marker.on('click', () => {
        onSelectRoute?.(pos.routeId);
      });
      marker.addTo(group);
    }

    lastBoundsRef.current = boundsCoords;

    // Fit bounds only when selectedRouteId changes
    if (lastFitRouteRef.current !== selectedRouteId && boundsCoords.length >= 2) {
      map.fitBounds(boundsCoords, { padding: [36, 36], maxZoom: 14 });
      lastFitRouteRef.current = selectedRouteId;
    }
  }, [
    routes,
    stops,
    vehicles,
    vehiclePositions,
    verificationsByRoute,
    selectedRouteId,
    userLat,
    userLng,
    lang,
    t,
    onSelectRoute,
    onSelectStop,
  ]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (lastBoundsRef.current.length >= 2) {
      map.fitBounds(lastBoundsRef.current, { padding: [36, 36], maxZoom: 14 });
    } else {
      map.setView([userLat, userLng], 13);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <button
        type="button"
        onClick={handleRecenter}
        aria-label="Recenter map"
        className="absolute right-3 top-3 z-[400] flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0B1F3A] shadow-md hover:bg-slate-50 cursor-pointer"
      >
        <LocateFixed className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-600" aria-hidden="true" />
            <span>{t('map.legendLive')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden="true" />
            <span>{t('map.legendDelayed')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden="true" />
            <span>{t('map.legendUnavailable')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" />
            <span>{t('map.legendCancelled')}</span>
          </span>
        </div>
        <span className="text-[11px] text-slate-500">OpenStreetMap · Leaflet</span>
      </div>
    </div>
  );
}
