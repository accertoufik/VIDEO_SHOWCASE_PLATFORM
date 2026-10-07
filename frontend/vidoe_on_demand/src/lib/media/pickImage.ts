import * as ImagePicker from 'expo-image-picker';

export type PickedImage = {
  uri: string;
  contentType: string;
  /** Without the dot, as the API expects. */ extension: string;
};

export type ImageKind = 'avatar' | 'banner' | 'thumbnail';

const ASPECT: Record<ImageKind, [number, number]> = {
  avatar: [1, 1],
  banner: [16, 5],
  thumbnail: [16, 9],
};

/** Opens the photo library with a crop step. Returns null if the user cancels. */
export const pickImage = async (
  kind: ImageKind,
): Promise<PickedImage | null> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: ASPECT[kind],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType ?? 'image/jpeg';
  const extension =
    mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return {
    uri: asset.uri,
    contentType: extension === 'jpg' ? 'image/jpeg' : mime,
    extension,
  };
};
