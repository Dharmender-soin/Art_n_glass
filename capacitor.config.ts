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
    webContentsDebuggingEnabled: false, // true karo sirf development mein
    // Required by @capacitor-community/background-geolocation
    // Prevents location updates from halting after 5 minutes in background
    useLegacyBridge: true,
  }
};

export default config;
