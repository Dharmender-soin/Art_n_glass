const GOOGLE_MAPS_API_KEY = "AIzaSyBIrluiF9C2_nyAIPAnHSRXpLx-X3UIRgg";

async function test(lat1, lon1, lat2, lon2) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log("Google Maps Distance Matrix API:");
  console.log(JSON.stringify(data.rows[0].elements[0], null, 2));
}

test(28.5078362, 77.1814296, 28.5747351, 77.0800422);

const fromLat = 28.5078362;
const fromLng = 77.1814296;
const gpsLat = 28.5747351;
const gpsLng = 77.0800422;

const R = 6371;
const dLat = (gpsLat - fromLat) * (Math.PI / 180);
const dLon = (gpsLng - fromLng) * (Math.PI / 180);
const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(fromLat * (Math.PI/180)) * Math.cos(gpsLat * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
const distance = Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));

console.log("Haversine Distance computed by ExecutiveHome formula:", distance);
