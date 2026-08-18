/**
 * useBackgroundTracking
 * ---------------------
 * Background GPS tracking hook for VisitWiz Pro.
 *
 * On Android/iOS (Capacitor native APK):
 *   - Uses @capacitor-community/background-geolocation via registerPlugin
 *   - Tracks even when app is minimized, screen is off, or phone is locked
 *   - Shows a persistent foreground-service notification while active
 *
 * On Web (browser):
 *   - Falls back to navigator.geolocation (only works while tab is visible)
 *
 * Architecture note:
 *   The background-geolocation package is native-only (no JS bundle), so we
 *   register it with Capacitor.registerPlugin() and supply a no-op web stub.
 *   The native Android/iOS layer automatically overrides the stub at runtime.
 */

import { useEffect, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Plugin interface ─────────────────────────────────────────────────────────
interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  bearing: number | null;
  time: number;
}

interface BackgroundGeolocationError {
  code: string;
}

interface WatcherOptions {
  backgroundTitle?: string;
  backgroundMessage?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}

type CallbackId = string;

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: WatcherOptions,
    callback: (location: Location | null, error: BackgroundGeolocationError | null) => void
  ): Promise<CallbackId>;
  removeWatcher(options: { id: CallbackId }): Promise<void>;
  openSettings(): Promise<void>;
}

// ── Web stub — all methods are no-ops so the web build doesn't crash ─────────
const webStub: BackgroundGeolocationPlugin = {
  addWatcher: async (_opts, _cb) => {
    // On web, native background tracking is not available.
    // The web fallback (navigator.geolocation) is used instead.
    return "web-noop-watcher";
  },
  removeWatcher: async () => {},
  openSettings: async () => {},
};

// ── Register the plugin — native layer overrides webStub on Android/iOS ─────
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
  { web: webStub }
);

// ── Helper: push a location update to Supabase ──────────────────────────────
async function pushLocation(userId: string, location: Pick<Location, "latitude" | "longitude" | "accuracy" | "altitude" | "speed" | "bearing" | "time">) {
  const now = new Date().toISOString();
  const telemetry = {
    accuracy_m: Number.isFinite(location.accuracy) ? location.accuracy : null,
    speed_mps: location.speed != null && Number.isFinite(location.speed) ? location.speed : null,
    bearing_deg: location.bearing != null && Number.isFinite(location.bearing) ? location.bearing : null,
    altitude_m: location.altitude != null && Number.isFinite(location.altitude) ? location.altitude : null,
  };
  try {
    const [liveResult, histResult] = await Promise.all([
      supabase.from("live_locations").upsert({
        user_id: userId,
        lat: location.latitude,
        lng: location.longitude,
        updated_at: now,
        recorded_at: location.time ? new Date(location.time).toISOString() : now,
        permission_status: "granted",
        ...telemetry,
      }),
      supabase.from("location_history").insert({
        user_id: userId,
        lat: location.latitude,
        lng: location.longitude,
        timestamp: now,
        ...telemetry,
      }),
    ]);
    if (liveResult.error) {
      console.error("[BGTracking] live_locations upsert error:", liveResult.error.message);
    }
    if (histResult.error) {
      console.error("[BGTracking] location_history insert error:", histResult.error.message);
    }
    if (!liveResult.error && !histResult.error) {
      console.log(`[BGTracking] ✓ Location saved: ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`);
    }
  } catch (err: any) {
    console.error("[BGTracking] pushLocation exception:", err?.message || err);
  }
}

// ── Hook options ─────────────────────────────────────────────────────────────
interface UseBackgroundTrackingOptions {
  /** true = tracking ON (Start Day done, End Day not yet done) */
  active: boolean;
  /** Supabase user ID */
  userId: string | undefined;
}

// ── Main Hook ────────────────────────────────────────────────────────────────
export function useBackgroundTracking({ active, userId }: UseBackgroundTrackingOptions) {
  const watcherIdRef = useRef<CallbackId | null>(null);
  const webIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const startingRef = useRef(false);
  const pushInFlightRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!active || !userId) {
      stopTracking();
      return;
    }

    if (isNative) {
      startNativeTracking(userId);
      // A distance-only watcher can stay silent while an employee is parked
      // or at a client. Heartbeats keep "last seen" genuinely current.
      startHeartbeat(userId);
    } else {
      startWebTracking(userId);
    }

    return () => { stopTracking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  // ── Native tracking (Capacitor) ──────────────────────────────────────────
  async function startNativeTracking(userId: string) {
    if (startingRef.current || watcherIdRef.current) return;
    startingRef.current = true;
    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "VisitWiz Pro — Tracking Active",
          backgroundMessage: "Your location is being recorded for field management.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 15, // smoother route updates without excessive battery use
        },
        async (location, error) => {
          if (error) {
            if (error.code === "NOT_AUTHORIZED") {
              toast.error(
                "Background location denied. Please enable in phone Settings → Apps → VisitWiz Pro → Permissions."
              );
              await BackgroundGeolocation.openSettings();
            }
            console.error("[BGTracking] Native error:", error);
            return;
          }
          if (location) {
            if (!pushInFlightRef.current) {
              pushInFlightRef.current = true;
              await pushLocation(userId, location).finally(() => { pushInFlightRef.current = false; });
            }
          }
        }
      );
      watcherIdRef.current = id;
      console.log("[BGTracking] Native watcher started:", id);
    } catch (err) {
      console.error("[BGTracking] Failed to start native tracking:", err);
      toast.error("Could not start background tracking.");
    } finally {
      startingRef.current = false;
    }
  }

  function startHeartbeat(userId: string) {
    if (heartbeatRef.current || !navigator.geolocation) return;
    const heartbeat = () => navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (pushInFlightRef.current) return;
        pushInFlightRef.current = true;
        pushLocation(userId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          bearing: pos.coords.heading,
          time: pos.timestamp,
        }).finally(() => { pushInFlightRef.current = false; });
      },
      (error) => console.warn("[BGTracking] heartbeat unavailable:", error.message),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
    heartbeat();
    heartbeatRef.current = setInterval(heartbeat, 120_000);
  }

  // ── Web fallback tracking ─────────────────────────────────────────────────
  function startWebTracking(userId: string) {
    let paused = false;

    const send = async () => {
      if (paused) return;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 15000,
            enableHighAccuracy: true,
          })
        );
        await pushLocation(userId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed,
          bearing: pos.coords.heading,
          time: pos.timestamp,
        });
      } catch (err: any) {
        console.error("[BGTracking] Web GPS error:", err);
        if (err?.code === 1) {
          paused = true;
          if (webIntervalRef.current) clearInterval(webIntervalRef.current);
          toast.error("GPS Permission Denied! Live tracking paused.");
        }
      }
    };

    send(); // immediate first update
    webIntervalRef.current = setInterval(send, 60_000); // then every 60s
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  async function stopTracking() {
    // Clear web interval
    if (webIntervalRef.current) {
      clearInterval(webIntervalRef.current);
      webIntervalRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    // Remove native watcher
    if (watcherIdRef.current && watcherIdRef.current !== "web-noop-watcher") {
      try {
        await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        console.log("[BGTracking] Native watcher removed:", watcherIdRef.current);
      } catch (err) {
        console.error("[BGTracking] Failed to remove watcher:", err);
      }
      watcherIdRef.current = null;
    }
  }
}
