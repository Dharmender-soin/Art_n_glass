import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.artnglasss.visitwiz',
  appName: 'Art N Glass',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true, // true karo sirf development mein
    // Required by @capacitor-community/background-geolocation
    // Prevents location updates from halting after 5 minutes in background
    useLegacyBridge: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
      iconColor: "#C21833",
    },
  }
};

export default config;
