export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function bearing(lat1, lng1, lat2, lng2) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

export function getFlag(name, countryFlags) {
  return countryFlags[name] || '📍';
}

export function wrapAngle(v) {
  v = ((Math.round(v * 10) / 10) % 360 + 360) % 360;
  return v > 180 ? v - 360 : v;
}

export function angleNear(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d) < 0.5;
}
