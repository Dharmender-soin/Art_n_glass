const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
dotenv.config();

const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  console.error("VITE_GOOGLE_MAPS_API_KEY not found in environment variables");
  process.exit(1);
}

const lat1 = 28.574757;
const lon1 = 77.0800311;
const lat2 = 28.5075559;
const lon2 = 77.1816317;

const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${apiKey}`;

fetch(url)
  .then(response => response.json())
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(error => {
    console.error("Error fetching distance from Google Maps API:", error);
  });
