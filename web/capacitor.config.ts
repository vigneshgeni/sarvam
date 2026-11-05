import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sarvam.app',
  appName: 'Sarvam',
  webDir: 'dist',
  server: {
    iosScheme: 'capacitor',
  },
  ios: {
    path: '../ios',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
