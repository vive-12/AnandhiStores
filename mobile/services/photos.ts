import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

/** Compress on the phone: no Storage bucket, hosted image processor or subscription. */
export async function preparePhoto(asset: ImagePickerAsset, kind: 'product' | 'offer' | 'qr' = 'product'): Promise<string> {
  const width = kind === 'qr' ? 640 : kind === 'offer' ? 720 : 320;
  const cap = kind === 'qr' ? 180_000 : kind === 'offer' ? 140_000 : 55_000;
  for (const quality of [0.65, 0.45, 0.25]) {
    const image = await manipulateAsync(asset.uri, [{ resize: { width: Math.min(asset.width || width, width) } }], { format: SaveFormat.JPEG, compress: quality, base64: true });
    if (image.base64 && image.base64.length <= cap) return 'data:image/jpeg;base64,' + image.base64;
  }
  throw new Error('This photo is too detailed. Crop it more tightly or choose a simpler image.');
}
