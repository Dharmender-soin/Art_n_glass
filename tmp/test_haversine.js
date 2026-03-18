const fromLat = 28.5079302;
const fromLng = 77.014290;
const gpsLat = 28.5079351;
const gpsLng = 77.0000402;

const R = 6371;
const dLat = (gpsLat - fromLat) * (Math.PI / 180);
const dLon = (gpsLng - fromLng) * (Math.PI / 180);
const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(fromLat * (Math.PI/180)) * Math.cos(gpsLat * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
const distance = Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));

console.log("Haversine Distance computed by ExecutiveHome formula:", distance);
