import type { Source } from '../../types';
import {
  ObjectStoragePresignedDownloadOptions,
  ObjectStoragePresignedUploadOptions,
  ObjectStoragePresignedUploadResult,
} from '../../object-storage/types';

export type { Source };

export type OvhObjectStorageClass =
  | 'high_performance'
  | 'standard'
  | 'infrequent_access'
  | 'active_archive'
  | 'cold_archive';

export interface OvhObjectStorageUploadOptions {
  storageClass?: OvhObjectStorageClass;
}

export type OvhPresignedUploadOptions = ObjectStoragePresignedUploadOptions;
export type OvhPresignedDownloadOptions = ObjectStoragePresignedDownloadOptions;
export type OvhPresignedUploadResult = ObjectStoragePresignedUploadResult;
