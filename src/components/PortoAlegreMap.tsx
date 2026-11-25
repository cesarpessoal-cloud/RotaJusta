import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  POA_CENTER,
  resolvePortoAlegreCoordinates,
} from '../constants/portoAlegre';

export interface MapStopPoint {
  id: string;
  sequence: number;
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
  heightClass?: string;
  title?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function PortoAlegreMap({
  pickup,
  stops,
  heightClass = 'h-[320px] sm:h-[360px]',
  title = 'Mapa da Rota em Porto Alegre (RS)',
}: PortoAlegreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

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
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
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

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const routeLatLngs: L.LatLngExpression[] = [];
    const { pickup: p, stops: sList } = resolvedPoints;

    // 1. Pickup Marker (Graphite + Emerald ring)
    const pickupLatLng: L.LatLngExpression = [p.lat, p.lng];
    routeLatLngs.push(pickupLatLng);

    const pickupIcon = L.divIcon({
      className: 'rotajusta-map-pin',
      html: `<div style="display:flex;align-items:center;gap:4px;background:#18181b;color:#ffffff;border:2px solid #10b981;border-radius:9999px;padding:3px 9px;font-family:'Plus Jakarta Sans',sans-serif;font-size:11px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,0.28);white-space:nowrap;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:9999px;background:#10b981;"></span>
        <span>Coleta</span>
      </div>`,
      iconSize: [74, 28],
      iconAnchor: [37, 14],
    });

    const pickupMarker = L.marker(pickupLatLng, { icon: pickupIcon });
    pickupMarker.bindPopup(
      `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;line-height:1.45;min-width:170px;">
        <div style="font-weight:700;color:#18181b;margin-bottom:2px;">Ponto de Coleta</div>
        ${p.label ? `<div style="color:#059669;font-weight:600;">${escapeHtml(p.label)}</div>` : ''}
        <div style="color:#3f3f46;">${escapeHtml(p.address || 'Endereço de coleta')}</div>
        <div style="color:#71717a;font-size:11px;">${escapeHtml(p.neighborhood)} · Porto Alegre</div>
      </div>`
    );
    pickupMarker.addTo(group);

    // 2. Numbered Delivery Stop Markers
    sList.forEach((stop) => {
      const stopLatLng: L.LatLngExpression = [stop.lat, stop.lng];
      routeLatLngs.push(stopLatLng);

      const bgColor = stop.delivered ? '#065f46' : '#059669';
      const borderColor = stop.delivered ? '#a7f3d0' : '#ffffff';
      const labelText = stop.delivered ? `${stop.sequence}✓` : `${stop.sequence}`;

      const stopIcon = L.divIcon({
        className: 'rotajusta-stop-pin',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${bgColor};color:#ffffff;border:2px solid ${borderColor};font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;box-shadow:0 3px 8px rgba(0,0,0,0.25);">
          ${escapeHtml(labelText)}
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const stopMarker = L.marker(stopLatLng, { icon: stopIcon });
      const statusText = stop.delivered
        ? `Entregue${stop.receiverName ? ` para ${escapeHtml(stop.receiverName)}` : ''}`
        : 'Pendente';

      stopMarker.bindPopup(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;line-height:1.45;min-width:180px;">
          <div style="font-weight:700;color:#065f46;margin-bottom:2px;">Parada #${stop.sequence} · ${statusText}</div>
          <div style="color:#18181b;font-weight:600;">${escapeHtml(stop.address || 'Endereço pendente')}</div>
          <div style="color:#52525b;font-size:11px;">Bairro ${escapeHtml(stop.neighborhood)}</div>
          ${
            stop.expectedRecipient
              ? `<div style="color:#3f3f46;margin-top:4px;">Recebedor: <strong>${escapeHtml(
                  stop.expectedRecipient
                )}</strong></div>`
              : ''
          }
          ${
            stop.recipientNote
              ? `<div style="color:#71717a;font-size:11px;">Obs: ${escapeHtml(
                  stop.recipientNote
                )}</div>`
              : ''
          }
        </div>`
      );
      stopMarker.addTo(group);
    });

    // 3. Dashed route polyline connecting Coleta -> Stop 1 -> Stop 2 ...
    if (routeLatLngs.length >= 2) {
      L.polyline(routeLatLngs, {
        color: '#059669',
        weight: 3,
        opacity: 0.85,
        dashArray: '8, 8',
      }).addTo(group);

      const bounds = L.latLngBounds(routeLatLngs);
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      map.invalidateSize();
      map.setView([p.lat, p.lng], 14);
    }
  }, [resolvedPoints]);

  const deliveredCount = resolvedPoints.stops.filter((s) => s.delivered).length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 px-4 py-2.5 bg-zinc-50/70">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
          <span>{title}</span>
          <span className="text-zinc-400 font-normal">·</span>
          <span className="font-mono text-zinc-500 font-normal tabular-nums">
            {resolvedPoints.stops.length} parada(s)
            {deliveredCount > 0 ? ` · ${deliveredCount} entregue(s)` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-900 border border-emerald-500" />
            <span>Coleta</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
            <span>Parada (1, 2, 3...)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-emerald-600" />
            <span>Trajeto</span>
          </span>
        </div>
      </div>

      <div className={`relative z-0 isolate w-full ${heightClass}`}>
        <div
          ref={containerRef}
          className="h-full w-full"
          aria-label={title}
        />
      </div>
    </div>
  );
}
