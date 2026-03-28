import { Source } from '../../types';

const DATA_URL_PREFIX = 'data:';

/**
 * Converts a Source (bytes, base64 string, data URL, or URL) to image bytes for the Rekognition API.
 */
export async function toImageBytes(source: Source): Promise<Uint8Array> {
  if (source instanceof URL) {
    const res = await fetch(source.href);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  }

  if (typeof source === 'string') {
    let base64: string;
    if (source.startsWith(DATA_URL_PREFIX)) {
      const comma = source.indexOf(',');
      if (comma === -1) throw new Error('Invalid data URL');
      base64 = source.slice(comma + 1);
    } else {
      base64 = source;
    }
    const clean = base64.replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(clean, 'base64'));
    }
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(source)) {
    return new Uint8Array(
      (source as Buffer).buffer,
      (source as Buffer).byteOffset,
      (source as Buffer).byteLength,
    );
  }
  if (source instanceof Uint8Array) return source;

  throw new Error('Unsupported source type');
}
