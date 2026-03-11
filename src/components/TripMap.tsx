import { useCallback, useState } from "react";
import { GoogleMap, DirectionsService, DirectionsRenderer } from "@react-google-maps/api";

const containerStyle = {
  width: '100%',
  height: '250px',
  borderRadius: '0.75rem'
};

interface TripMapProps {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}

export function TripMap({ fromLat, fromLng, toLat, toLng }: TripMapProps) {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  const directionsCallback = useCallback(
    (
      result: google.maps.DirectionsResult | null,
      status: google.maps.DirectionsStatus
    ) => {
      // DirectionsService triggers callback continuously if dependencies change,
      // but we wrap it in useCallback and only set once.
      if (status === "OK" && result) {
        setDirections(result);
      }
    },
    []
  );

  return (
    <div className="w-full relative border border-border rounded-xl overflow-hidden mt-4">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={{ lat: (fromLat + toLat) / 2, lng: (fromLng + toLng) / 2 }}
        zoom={12}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        }}
      >
        {!directions && (
          <DirectionsService
            options={{
              destination: { lat: toLat, lng: toLng },
              origin: { lat: fromLat, lng: fromLng },
              travelMode: window.google?.maps?.TravelMode?.DRIVING,
            }}
            callback={directionsCallback}
          />
        )}

        {directions && (
          <DirectionsRenderer
            options={{
              directions: directions,
              suppressMarkers: false,
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
}
