import { calculateUrbanDistanceKm } from './addressLookup';

export interface RouteWaypoint {
  lat: number;
  lng: number;
}

export interface OsrmRouteResult {
  geometry: Array<[number, number]>; // [lat, lng]
  distanceKm: number;
  durationMinutes: number;
  isFallback: boolean;
}

const routeCache = new Map<string, OsrmRouteResult>();

function buildCacheKey(waypoints: RouteWaypoint[]): string {
  return waypoints
    .map((pt) => `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`)
    .join('|');
}

export function buildFallbackRoute(waypoints: RouteWaypoint[]): OsrmRouteResult {
  if (waypoints.length < 2) {
    return {
      geometry: waypoints.map((w) => [w.lat, w.lng]),
      distanceKm: 0,
      durationMinutes: 0,
      isFallback: true,
    };
  }

  let totalKm = 0;
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    totalKm += calculateUrbanDistanceKm(
      waypoints[i].lat,
      waypoints[i].lng,
      waypoints[i + 1].lat,
      waypoints[i + 1].lng
    );
  }
  const distanceKm = Number(totalKm.toFixed(1));
  const durationMinutes = Math.max(3, Math.round((distanceKm / 24) * 60));

  return {
    geometry: waypoints.map((w) => [w.lat, w.lng]),
    distanceKm,
    durationMinutes,
    isFallback: true,
  };
}

export async function fetchOsrmDrivingRoute(
  waypoints: RouteWaypoint[],
  signal?: AbortSignal
): Promise<OsrmRouteResult> {
  if (waypoints.length < 2) {
    return buildFallbackRoute(waypoints);
  }

  const key = buildCacheKey(waypoints);
  const cached = routeCache.get(key);
  if (cached) {
    return cached;
  }

  const coordsParam = waypoints
    .map((pt) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`)
    .join(';');

  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 5500);

  const forwardAbort = () => timeoutController.abort();
  if (signal) {
    if (signal.aborted) {
      timeoutController.abort();
    } else {
      signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url, { signal: timeoutController.signal });
    if (!res.ok) {
      throw new Error(`OSRM HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: {
          type?: string;
          coordinates?: Array<[number, number]>;
        };
      }>;
    };

    const firstRoute = json.routes?.[0];
    const coords = firstRoute?.geometry?.coordinates;
    if (
      json.code !== 'Ok' ||
      !firstRoute ||
      !Array.isArray(coords) ||
      coords.length < 2
    ) {
      throw new Error('OSRM route unavailable');
    }

    const geometry: Array<[number, number]> = coords.map(([lng, lat]) => [
      lat,
      lng,
    ]);
    const distanceKm = Number(((firstRoute.distance ?? 0) / 1000).toFixed(1));
    const durationMinutes = Math.max(
      1,
      Math.round((firstRoute.duration ?? 0) / 60)
    );

    const result: OsrmRouteResult = {
      geometry,
      distanceKm,
      durationMinutes,
      isFallback: false,
    };
    routeCache.set(key, result);
    return result;
  } catch {
    return buildFallbackRoute(waypoints);
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', forwardAbort);
    }
  }
}
