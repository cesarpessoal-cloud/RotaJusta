import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Clock, Navigation, Route } from 'lucide-react';
import {
  POA_CENTER,
  resolvePortoAlegreCoordinates,
} from '../constants/portoAlegre';
import {
  buildFallbackRoute,
  fetchOsrmDrivingRoute,
  OsrmRouteResult,
  RouteWaypoint,
} from '../utils/osrmRouting';

export interface MapStopPoint {
  id: string;
  sequence: number;
  pickupCode?: string;
  address: string;
  neighborhood: string;
  expectedRecipient?: string;
  recipientNote?: string;
  receiverName?: string;
  delivered?: boolean;
  lat?: number;
  lng?: number;
}

export interface MapPickupPoint {
  label?: string;
  address: string;
  neighborhood: string;
  lat?: number;
  lng?: number;
}

interface PortoAlegreMapProps {
  pickup: MapPickupPoint;
  stops: MapStopPoint[];
  orderCode?: string;
  heightClass?: string;
  title?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTeardropPinHtml(options: {
  fill: string;
  stroke: string;
  innerSvg: string;
  badgeText?: string;
  badgeBg?: string;
}): string {
  const { fill, stroke, innerSvg, badgeText, badgeBg = '#18181b' } = options;
  return `
    <div style="position:relative;width:36px;height:44px;filter:drop-shadow(0 4px 8px rgba(15,23,42,0.32));">
      <svg viewBox="0 0 36 44" width="36" height="44" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 2C9.716 2 3 8.716 3 17c0 10.2 12.6 22.8 14.18 24.34a1.18 1.18 0 0 0 1.64 0C20.4 39.8 33 27.2 33 17 33 8.716 26.284 2 18 2Z" fill="${fill}" stroke="${stroke}" stroke-width="2.2" />
      </svg>
      <div style="position:absolute;top:7px;left:50%;transform:translateX(-50%);width:20px;height:20px;display:flex;align-items:center;justify-content:center;color:#ffffff;">
        ${innerSvg}
      </div>
      ${
        badgeText
          ? `<div style="position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9999px;background:${badgeBg};color:#ffffff;border:1.5px solid #ffffff;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;">${escapeHtml(badgeText)}</div>`
          : ''
      }
    </div>
  `;
}

const STORE_PACKAGE_ICON_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;

const FLAG_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;

const CHECK_ICON_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export function PortoAlegreMap({
  pickup,
  stops,
  orderCode,
  heightClass = 'h-[320px] sm:h-[360px]',
  title = 'Mapa da Rota em Porto Alegre (RS)',
}: PortoAlegreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const [routeResult, setRouteResult] = useState<OsrmRouteResult | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  const resolvedPoints = useMemo(() => {
    const pickupResolved =
      pickup.lat !== undefined && pickup.lng !== undefined
        ? { lat: pickup.lat, lng: pickup.lng }
        : resolvePortoAlegreCoordinates(
            pickup.address,
            pickup.neighborhood || 'Centro Histórico',
            0
          );

    const stopPoints = stops.map((stop, idx) => {
      const coords =
        stop.lat !== undefined && stop.lng !== undefined
          ? { lat: stop.lat, lng: stop.lng }
          : resolvePortoAlegreCoordinates(
              stop.address,
              stop.neighborhood || 'Menino Deus',
              idx + 1
            );
      return {
        ...stop,
        lat: coords.lat,
        lng: coords.lng,
      };
    });

    return {
      pickup: {
        ...pickup,
        lat: pickupResolved.lat,
        lng: pickupResolved.lng,
      },
      stops: stopPoints,
    };
  }, [pickup, stops]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [POA_CENTER.lat, POA_CENTER.lng],
      zoom: 13,
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }
    ).addTo(map);

    const routeGroup = L.layerGroup().addTo(map);
    const markersGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    routeLayerRef.current = routeGroup;
    markersLayerRef.current = markersGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersLayerRef.current;
    const routeGroup = routeLayerRef.current;
    if (!map || !markersGroup || !routeGroup) return;

    markersGroup.clearLayers();
    routeGroup.clearLayers();

    const { pickup: p, stops: sList } = resolvedPoints;
    const waypoints: RouteWaypoint[] = [{ lat: p.lat, lng: p.lng }];
    const markerLatLngs: L.LatLngExpression[] = [[p.lat, p.lng]];
    const isMultiStop = sList.length > 1;

    // 1. Pickup Marker (Modern Emerald Pin with Package Icon)
    const pickupIcon = L.divIcon({
      className: 'rotajusta-pickup-pin',
      html: buildTeardropPinHtml({
        fill: '#059669',
        stroke: '#ffffff',
        innerSvg: STORE_PACKAGE_ICON_SVG,
      }),
      iconSize: [36, 44],
      iconAnchor: [18, 42],
      popupAnchor: [0, -38],
    });

    const pickupMarker = L.marker([p.lat, p.lng], {
      icon: pickupIcon,
      zIndexOffset: 200,
    });

    const displayOrderCode = orderCode ? escapeHtml(orderCode) : '';
    pickupMarker.bindPopup(
      `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;line-height:1.45;min-width:190px;max-width:250px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
          <span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:2px 7px;border-radius:6px;font-size:11px;">Ponto de Coleta</span>
          ${
            displayOrderCode
              ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#18181b;font-size:11px;">${displayOrderCode}</span>`
              : ''
          }
        </div>
        ${
          p.label
            ? `<div style="color:#047857;font-weight:700;margin-bottom:2px;">${escapeHtml(
                p.label
              )}</div>`
            : ''
        }
        <div style="color:#18181b;font-weight:600;">${escapeHtml(
          p.address || 'Endereço de coleta'
        )}</div>
        <div style="color:#71717a;font-size:11px;margin-top:2px;">${escapeHtml(
          p.neighborhood || 'Porto Alegre'
        )} · Porto Alegre, RS</div>
      </div>`
    );
    pickupMarker.addTo(markersGroup);

    // 2. Delivery Stop Markers (Modern Orange/Red Pin with Flag Icon, or Emerald Check if Delivered)
    sList.forEach((stop) => {
      const stopLatLng: L.LatLngExpression = [stop.lat, stop.lng];
      waypoints.push({ lat: stop.lat, lng: stop.lng });
      markerLatLngs.push(stopLatLng);

      const pinFill = stop.delivered ? '#047857' : '#ea580c';
      const stopIcon = L.divIcon({
        className: 'rotajusta-delivery-pin',
        html: buildTeardropPinHtml({
          fill: pinFill,
          stroke: '#ffffff',
          innerSvg: stop.delivered ? CHECK_ICON_SVG : FLAG_ICON_SVG,
          badgeText: isMultiStop ? String(stop.sequence) : undefined,
          badgeBg: stop.delivered ? '#064e3b' : '#18181b',
        }),
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -38],
      });

      const stopMarker = L.marker(stopLatLng, {
        icon: stopIcon,
        zIndexOffset: 150 + stop.sequence,
      });

      const stopCode = stop.pickupCode || orderCode;
      const statusText = stop.delivered
        ? `Entregue${
            stop.receiverName ? ` para ${escapeHtml(stop.receiverName)}` : ''
          }`
        : 'Ponto de Entrega';

      stopMarker.bindPopup(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;line-height:1.45;min-width:195px;max-width:255px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
            <span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:${
              stop.delivered ? '#065f46' : '#9a3412'
            };background:${
          stop.delivered ? '#ecfdf5' : '#fff7ed'
        };border:1px solid ${
          stop.delivered ? '#a7f3d0' : '#fed7aa'
        };padding:2px 7px;border-radius:6px;font-size:11px;">
              ${isMultiStop ? `Entrega #${stop.sequence}` : statusText}
            </span>
            ${
              stopCode
                ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#18181b;font-size:11px;">${escapeHtml(
                    stopCode
                  )}</span>`
                : ''
            }
          </div>
          <div style="color:#18181b;font-weight:600;">${escapeHtml(
            stop.address || 'Endereço pendente'
          )}</div>
          <div style="color:#52525b;font-size:11px;margin-top:2px;">Bairro ${escapeHtml(
            stop.neighborhood || 'Porto Alegre'
          )} · Porto Alegre, RS</div>
          ${
            stop.expectedRecipient
              ? `<div style="color:#3f3f46;margin-top:5px;">Recebedor: <strong>${escapeHtml(
                  stop.expectedRecipient
                )}</strong></div>`
              : ''
          }
          ${
            stop.recipientNote
              ? `<div style="color:#71717a;font-size:11px;margin-top:2px;">Obs: ${escapeHtml(
                  stop.recipientNote
                )}</div>`
              : ''
          }
        </div>`
      );
      stopMarker.addTo(markersGroup);
    });

    map.invalidateSize();

    if (waypoints.length < 2) {
      setRouteResult(null);
      setIsLoadingRoute(false);
      map.setView([p.lat, p.lng], 14);
      return;
    }

    // Immediate bounds fit + subtle placeholder dashed route while OSRM fetches
    const initialBounds = L.latLngBounds(markerLatLngs);
    map.fitBounds(initialBounds, { padding: [46, 46], maxZoom: 15 });

    const fallback = buildFallbackRoute(waypoints);
    setRouteResult(fallback);

    const drawPolyline = (res: OsrmRouteResult) => {
      routeGroup.clearLayers();
      if (res.geometry.length < 2) return;

      if (!res.isFallback) {
        // Outer route casing for high contrast over CartoDB Voyager roads
        L.polyline(res.geometry, {
          color: '#1e3a8a',
          weight: 7,
          opacity: 0.28,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeGroup);

        // Smooth vibrant logistics route line
        const primaryLine = L.polyline(res.geometry, {
          color: '#2563eb',
          weight: 4.5,
          opacity: 0.94,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(routeGroup);

        const combinedBounds = initialBounds.extend(primaryLine.getBounds());
        map.fitBounds(combinedBounds, { padding: [44, 44], maxZoom: 15 });
      } else {
        L.polyline(res.geometry, {
          color: '#2563eb',
          weight: 3.5,
          opacity: 0.72,
          dashArray: '8, 8',
          lineCap: 'round',
        }).addTo(routeGroup);
      }
    };

    drawPolyline(fallback);

    const abortController = new AbortController();
    setIsLoadingRoute(true);

    void fetchOsrmDrivingRoute(waypoints, abortController.signal).then(
      (result) => {
        if (abortController.signal.aborted) return;
        setRouteResult(result);
        setIsLoadingRoute(false);
        drawPolyline(result);
      }
    );

    return () => {
      abortController.abort();
    };
  }, [resolvedPoints, orderCode]);

  const deliveredCount = resolvedPoints.stops.filter((s) => s.delivered).length;
  const formattedDistance = routeResult
    ? routeResult.distanceKm.toFixed(1).replace('.', ',')
    : null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 px-3.5 py-2.5 bg-zinc-50/80">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-800">
          <span>{title}</span>
          <span className="text-zinc-300 font-normal">·</span>
          <span className="font-mono text-zinc-500 font-normal tabular-nums">
            {resolvedPoints.stops.length} parada(s)
            {deliveredCount > 0 ? ` · ${deliveredCount} entregue(s)` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-100" />
            <span>Coleta</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-600 ring-2 ring-orange-100" />
            <span>Entrega</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-[3px] rounded-full border-blue-600" />
            <span>Rota</span>
          </span>
        </div>
      </div>

      <div className={`relative z-0 isolate w-full ${heightClass}`}>
        <div
          ref={containerRef}
          className="h-full w-full"
          aria-label={title}
        />

        {routeResult && routeResult.distanceKm > 0 && (
          <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-[400] flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200/90 bg-white/95 backdrop-blur-xs px-2.5 py-1.5 shadow-sm text-xs">
              <span className="inline-flex items-center gap-1 font-mono font-bold text-zinc-900 tabular-nums">
                <Route className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                {routeResult.isFallback ? '~' : ''}
                {formattedDistance} km
              </span>
              <span className="text-zinc-300">|</span>
              <span className="inline-flex items-center gap-1 font-mono font-semibold text-zinc-700 tabular-nums">
                <Clock className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                ~{routeResult.durationMinutes} min
              </span>
              {isLoadingRoute ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                  <Navigation className="h-3 w-3 animate-pulse" aria-hidden="true" />
                  Traçando ruas...
                </span>
              ) : !routeResult.isFallback ? (
                <span className="hidden sm:inline text-[10px] font-medium text-blue-700">
                  Via ruas
                </span>
              ) : (
                <span className="hidden sm:inline text-[10px] font-medium text-zinc-500">
                  Estimado
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
