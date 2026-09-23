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

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withLocationTelemetryFallback } from "@/lib/locationTelemetry";

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
  const now = new Date(Number.isFinite(location.time) ? Math.min(location.time, Date.now()) : Date.now()).toISOString();
  const telemetry = {
    accuracy_m: Number.isFinite(location.accuracy) ? location.accuracy : null,
    speed_mps: location.speed != null && Number.isFinite(location.speed) ? location.speed : null,
    bearing_deg: location.bearing != null && Number.isFinite(location.bearing) ? location.bearing : null,
    altitude_m: location.altitude != null && Number.isFinite(location.altitude) ? location.altitude : null,
  };
  try {
    const basicLocation = { user_id: userId, lat: location.latitude, lng: location.longitude };
    const [liveResult, histResult] = await Promise.all([
      withLocationTelemetryFallback(() => supabase.from("live_locations").upsert({
        ...basicLocation,
        updated_at: now,
        recorded_at: now,
        permission_status: "granted",
        ...telemetry,
      }), () => supabase.from("live_locations").upsert({ ...basicLocation, updated_at: now })),
      withLocationTelemetryFallback(() => supabase.from("location_history").insert({
        ...basicLocation,
        timestamp: now,
        ...telemetry,
      }), () => supabase.from("location_history").insert({ ...basicLocation, timestamp: now })),
    ]);
    if (liveResult.error) {
      console.error("[BGTracking] live_locations upsert error:", liveResult.error.message);
      toast.error("Live location could not be saved. Tracking will retry automatically.", { id: "tracking-upload" });
    }
    if (histResult.error) {
      console.error("[BGTracking] location_history insert error:", histResult.error.message);
    }
    if (!liveResult.error && !histResult.error) {
      toast.dismiss("tracking-upload");
      toast.dismiss("tracking-gps");
      toast.dismiss("tracking-permission");
    }
  } catch (err: any) {
    console.error("[BGTracking] pushLocation exception:", err?.message || err);
    toast.error("Live location could not be saved. Tracking will retry automatically.", { id: "tracking-upload" });
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
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!active || !userId) return;
    // Each Start Day/account gets its own lifecycle. A late GPS callback or
    // native watcher registration must not survive End Day or sign-out.
    let cancelled = false;
    let watcherId: CallbackId | null = null;
    let starting = false;
    let nativeNeedsRestart = false;
    let requesting = false;
    let writing = false;
    let lastRecordedAt = 0;
    let permissionDenied = false;
    let permission: PermissionStatus | undefined;

    const save = async (location: Location) => {
      if (cancelled || writing || location.time < lastRecordedAt) return;
      lastRecordedAt = location.time;
      writing = true;
      try { await pushLocation(userId, location); }
      finally { writing = false; }
    };

    const removeWatcher = (id: string) => BackgroundGeolocation.removeWatcher({ id })
      .catch(error => console.error("[BGTracking] Watcher cleanup failed:", error));

    const startNative = async () => {
      if (cancelled || starting || (watcherId && !nativeNeedsRestart)) return;
      starting = true;
      try {
        if (watcherId) {
          await removeWatcher(watcherId);
          watcherId = null;
        }
        if (cancelled) return;
        nativeNeedsRestart = false;
        const id = await BackgroundGeolocation.addWatcher({
          backgroundTitle: "Art N Glass — Tracking Active",
          backgroundMessage: "Your location is being recorded for field management.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 15, // smoother route updates without excessive battery use
        }, (location, error) => {
          if (cancelled) return;
          if (error) {
            nativeNeedsRestart = true;
            if (error.code === "NOT_AUTHORIZED") toast.error("Allow background location in phone settings to resume live tracking.", {
              id: "tracking-permission",
              action: { label: "Settings", onClick: () => { void BackgroundGeolocation.openSettings(); } },
            });
            return;
          }
          if (location) void save(location);
        });
        if (cancelled) await removeWatcher(id);
        else watcherId = id;
      } catch (error) {
        nativeNeedsRestart = true;
        console.error("[BGTracking] Could not start tracking:", error);
        if (!cancelled) toast.error("Could not start background tracking. Reopen the app to retry.", { id: "tracking-start" });
      } finally { starting = false; }
    };

    const sample = () => {
      if (cancelled || requesting || permissionDenied || !navigator.geolocation) return;
      requesting = true;
      navigator.geolocation.getCurrentPosition(pos => {
        requesting = false;
        if (cancelled) return;
        void save({ latitude: pos.coords.latitude, longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy, altitude: pos.coords.altitude,
          speed: pos.coords.speed, bearing: pos.coords.heading, time: pos.timestamp });
      }, error => {
        requesting = false;
        if (cancelled) return;
        if (error.code === 1) {
          permissionDenied = true;
          toast.error("GPS permission denied. Allow location and return to the app to resume tracking.", { id: "tracking-permission" });
        } else {
          toast.error("GPS update unavailable. Tracking will retry automatically.", { id: "tracking-gps" });
        }
      }, { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 });
    };

    const resume = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      permissionDenied = false;
      if (isNative) void startNative();
      sample();
    };
    const permissionChanged = () => { if (permission?.state === "granted") resume(); };
    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" }).then(status => {
        if (cancelled) return;
        permission = status;
        status.addEventListener("change", permissionChanged);
      }).catch(() => {}); // Permissions API is not supported by every WebView.
    }
    if (!isNative && !navigator.geolocation) toast.error("Location is unavailable in this browser.");
    if (isNative) void startNative();
    sample();
    const timer = setInterval(sample, isNative ? 120_000 : 60_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      permission?.removeEventListener("change", permissionChanged);
      if (watcherId) void removeWatcher(watcherId);
    };
  }, [active, userId, isNative]);
}
