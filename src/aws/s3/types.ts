import type { Source } from '../../types';
import {
  ObjectStoragePresignedDownloadOptions,
  ObjectStoragePresignedUploadOptions,
  ObjectStoragePresignedUploadResult,
} from '../../object-storage/types';

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

export type S3PresignedUploadOptions = ObjectStoragePresignedUploadOptions;
export type S3PresignedDownloadOptions = ObjectStoragePresignedDownloadOptions;
export type S3PresignedUploadResult = ObjectStoragePresignedUploadResult;
