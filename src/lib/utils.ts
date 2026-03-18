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

import { toast } from "sonner";

let googleMapsPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API Key not found"));
  }

  // If already loaded by another component
  if (window.google && window.google.maps) {
    googleMapsPromise = Promise.resolve();
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

/**
 * Calculates the actual driving distance using Google Maps Distance Matrix API.
 * Falls back to Haversine straight-line distance if the API request fails.
 */
export async function calculateRouteDistance(lat1: number, lon1: number, lat2: number, lon2: number): Promise<number> {
  try {
    await loadGoogleMapsScript();
    
    if (!window.google || !window.google.maps) {
        throw new Error("Google Maps not loaded");
    }

    const service = new window.google.maps.DistanceMatrixService();
    
    const response = await new Promise<google.maps.DistanceMatrixResponse>((resolve, reject) => {
        service.getDistanceMatrix({
            origins: [{ lat: lat1, lng: lon1 }],
            destinations: [{ lat: lat2, lng: lon2 }],
            travelMode: window.google.maps.TravelMode.DRIVING,
        }, (res, status) => {
            if (status === window.google.maps.DistanceMatrixStatus.OK && res) {
                resolve(res);
            } else {
                reject(new Error(`Distance Matrix failed with status: ${status}`));
            }
        });
    });

    if (response.rows[0]?.elements[0]?.status === window.google.maps.DistanceMatrixElementStatus.OK) {
      // The API returns distance in meters, convert to km
      const distanceInMeters = response.rows[0].elements[0].distance.value;
      return Number((distanceInMeters / 1000).toFixed(1));
    } else {
      console.warn("Google Maps Distance Matrix element status not OK. Falling back to straight-line distance.", response);
      toast.error("Road distance failed. Falling back to straight-line distance.");
      return calculateDistance(lat1, lon1, lat2, lon2);
    }
  } catch (error) {
    console.error("Error fetching distance from Google Maps:", error);
    toast.error("Map calculation failed. Falling back to straight-line distance.");
    return calculateDistance(lat1, lon1, lat2, lon2);
  }
}
