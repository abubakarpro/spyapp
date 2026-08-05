import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View, PermissionsAndroid, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { startBackgroundSync } from './src/services/BackgroundSyncService';

export default function App() {
  const [deviceId, setDeviceId] = useState<string>('LOADING_ID');

  // Runtime permissions mangne ka function
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          // PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          // PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          // Android version ke hisab se storage/media permissions handle karna
          ...(Platform.Version >= 33
            ? [
                PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
                PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
              ]
            : [
                PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
              ]),
        ]);

        console.log('Permissions status:', grants);
      } catch (err) {
        console.warn('Permission request error:', err);
      }
    }
  };

  useEffect(() => {
    const initApp = async () => {
      // Pehle permissions maang lo
      await requestPermissions();

      // Phir unique device ID uthao
      const uniqueId = await DeviceInfo.getUniqueId();
      setDeviceId(uniqueId);

      // Background sync start karo
      startBackgroundSync({
        backendUrl: 'https://clothstorebackend-production.up.railway.app', // Base URL only, no trailing slash
        deviceId: uniqueId,
      });
    };

    initApp();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Active Device ID: {deviceId}</Text>
      </View>
      <DashboardScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  banner: { padding: 8, backgroundColor: '#e1e4e8', alignItems: 'center' },
  bannerText: { fontSize: 11, color: '#24292e', fontWeight: '600' },
});