import { loadGoogleMapsScript } from './utils';

export function validVisitCoordinates(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0);
}

const addressCache = new Map<string, Promise<string | null>>();
export function resolveVisitAddress(lat: number, lng: number): Promise<string | null> {
  if (!validVisitCoordinates(lat, lng)) return Promise.resolve(null);
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (!addressCache.has(key)) {
    const request = new Promise<string | null>(resolve => {
      const timer = window.setTimeout(() => resolve(null), 8000);
      loadGoogleMapsScript().then(() => {
        new google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
          window.clearTimeout(timer);
          resolve(status === 'OK' ? results?.[0]?.formatted_address || null : null);
        });
      }).catch(() => { window.clearTimeout(timer); resolve(null); });
    });
    addressCache.set(key, request);
    void request.then(address => { if (!address) addressCache.delete(key); });
  }
  return addressCache.get(key)!;
}

export function visitMapUrl(lat: number | null | undefined, lng: number | null | undefined): string | null {
  return validVisitCoordinates(lat, lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;
}
