import { Buffer } from 'buffer';

import { Source } from '../types';

export type { Source };

export type S3StorageClass =
  | 'standard'
  | 'standard_ia'
  | 'onezone_ia'
  | 'intelligent_tiering'
  | 'glacier_ir'
  | 'glacier'
  | 'deep_archive'
  | 'express_onezone';

export interface S3UploadOptions {
  storageClass?: S3StorageClass;
}

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
