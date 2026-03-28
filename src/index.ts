export type { Source } from './types';
export { AntokelAws } from './aws';
export { AntokelOVH } from './ovh';
export type { TableConfig } from './aws/dynamodb';
export { field } from './aws/dynamodb/models/field';
export type {
  S3StorageClass,
  S3UploadOptions,
  S3PresignedDownloadOptions,
  S3PresignedUploadOptions,
  S3PresignedUploadResult,
} from './aws/s3';
export type {
  OvhConfig,
  OvhObjectStorageClass,
  OvhObjectStorageUploadOptions,
  OvhPresignedDownloadOptions,
  OvhPresignedUploadOptions,
  OvhPresignedUploadResult,
} from './ovh';
export { SubmoduleTranscribeAs, TranscribeWrapper } from './aws/transcribe';
export type {
  TranscribeBytesSource,
  TranscribeConfig,
  TranscribeLanguageOptions,
  TranscribeMediaFormat,
  TranscribeRequestOptions,
  TranscribeResult,
  TranscribeSegment,
  TranscribeToken,
  TranscribeWord,
} from './aws/transcribe';
