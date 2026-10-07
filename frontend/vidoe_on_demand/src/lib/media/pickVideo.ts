import * as ImagePicker from 'expo-image-picker';

export type PickedVideo = {
  uri: string;
  name: string;
  contentType: string;
  /** Without the dot. */
  extension: string;
  durationSec: number | null;
  sizeBytes: number | null;
};

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
};
const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]),
);

/** Opens the library for a video. No editing step, so the original file is uploaded untouched. */
export const pickVideo = async (): Promise<PickedVideo | null> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
  const extension =
    (fromName && fromName.length <= 5 ? fromName : undefined) ??
    (asset.mimeType ? EXT_BY_MIME[asset.mimeType] : undefined) ??
    'mp4';

  return {
    uri: asset.uri,
    name: asset.fileName ?? `video.${extension}`,
    contentType: MIME_BY_EXT[extension] ?? asset.mimeType ?? 'video/mp4',
    extension,
    // expo-image-picker reports duration in milliseconds.
    durationSec: asset.duration != null ? asset.duration / 1000 : null,
    sizeBytes: asset.fileSize ?? null,
  };
};
