/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React from 'react';
import App from './App';
import { name as appName } from './app.json';
import BackgroundFetch from 'react-native-background-fetch';
import { headlessTask } from './src/services/BackgroundSyncService';

const AppWithSafeArea = () => (
  <SafeAreaProvider>
    <App />
  </SafeAreaProvider>
);

AppRegistry.registerComponent(appName, () => AppWithSafeArea);

// Register background fetch headless task for Android when app is terminated
BackgroundFetch.registerHeadlessTask(headlessTask);
