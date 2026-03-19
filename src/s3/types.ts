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
  /**
   * How long the presigned URL remains valid, in seconds.
   * Defaults to 900 seconds (15 minutes). Maximum 604800 seconds (7 days).
   */
  expiresInSeconds?: number;
  /**
   * Optional content type that the client must send with the upload request.
   */
  contentType?: string;
}

export interface S3PresignedDownloadOptions {
  /**
   * How long the presigned URL remains valid, in seconds.
   * Defaults to 900 seconds (15 minutes). Maximum 604800 seconds (7 days).
   */
  expiresInSeconds?: number;
}

export interface S3PresignedUploadResult {
  url: string;
  method: 'PUT';
  bucket: string;
  pathToFile: string;
  headers: Record<string, string>;
}
