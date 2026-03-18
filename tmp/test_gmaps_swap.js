const GOOGLE_MAPS_API_KEY = "AIzaSyBIrluiF9C2_nyAIPAnHSRXpLx-X3UIRgg";

async function test(lat1, lon1, lat2, lon2) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test(77.014290, 28.5079302, 77.0000402, 28.5079351); // swapped
