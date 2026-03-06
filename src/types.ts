import { Buffer } from 'buffer';

/**
 * Supported file source input for S3 uploads and Rekognition analysis.
 * Bytes (Buffer, Uint8Array, ArrayBuffer), base64 string, data URL, or URL to fetch.
 */
export type Source = string | URL | ArrayBuffer | Uint8Array | Buffer;
