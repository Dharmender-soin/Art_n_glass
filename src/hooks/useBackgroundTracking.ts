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
async function pushLocation(userId: string, lat: number, lng: number) {
  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("live_locations").upsert({
      user_id: userId,
      lat,
      lng,
      updated_at: now,
    }),
    supabase.from("location_history").insert({
      user_id: userId,
      lat,
      lng,
      timestamp: now,
    }),
  ]);
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
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!active || !userId) {
      stopTracking();
      return;
    }

    if (isNative) {
      startNativeTracking(userId);
    } else {
      startWebTracking(userId);
    }

    return () => { stopTracking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId]);

  // ── Native tracking (Capacitor) ──────────────────────────────────────────
  async function startNativeTracking(userId: string) {
    try {
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "VisitWiz Pro — Tracking Active",
          backgroundMessage: "Your location is being recorded for field management.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 30, // update every 30 metres of movement
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
            await pushLocation(userId, location.latitude, location.longitude);
          }
        }
      );
      watcherIdRef.current = id;
      console.log("[BGTracking] Native watcher started:", id);
    } catch (err) {
      console.error("[BGTracking] Failed to start native tracking:", err);
      toast.error("Could not start background tracking.");
    }
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
        await pushLocation(userId, pos.coords.latitude, pos.coords.longitude);
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
