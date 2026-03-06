import { Buffer } from 'buffer';

import { Source } from '../types';

export type { Source };

export interface S3PresignedUploadOptions {
  expiresInSeconds?: number;
  contentType?: string;
}

export interface S3PresignedDownloadOptions {
  expiresInSeconds?: number;
}

export interface S3PresignedUploadResult {
  url: string;
  method: 'PUT';
  bucket: string;
  pathToFile: string;
  headers: Record<string, string>;
}
