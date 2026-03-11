import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates the distance between two geo-coordinates in kilometers using the Haversine formula (straight line).
 * Used as a fallback if the Google Maps API fails.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // distance in km
  return Number(distance.toFixed(1)); // round to 1 decimal
}

/**
 * Calculates the actual driving distance using Google Maps Distance Matrix API.
 * Falls back to Haversine straight-line distance if the API request fails.
 */
export async function calculateRouteDistance(lat1: number, lon1: number, lat2: number, lon2: number): Promise<number> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.warn("Google Maps API Key not found. Falling back to straight-line distance.");
    return calculateDistance(lat1, lon1, lat2, lon2);
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.rows[0].elements[0].status === "OK") {
      // The API returns distance in meters, convert to km
      const distanceInMeters = data.rows[0].elements[0].distance.value;
      return Number((distanceInMeters / 1000).toFixed(1));
    } else {
      console.warn("Google Maps API returned non-OK status. Falling back to straight-line distance.", data);
      return calculateDistance(lat1, lon1, lat2, lon2);
    }
  } catch (error) {
    console.error("Error fetching distance from Google Maps API:", error);
    return calculateDistance(lat1, lon1, lat2, lon2);
  }
}
