import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ObjectStoragePresignedDownloadOptions,
  ObjectStoragePresignedUploadOptions,
  ObjectStoragePresignedUploadResult,
} from './types';
import { resolveObjectStorageKey, resolvePresignedExpirationSeconds } from './shared';

export class ObjectStoragePresignedModule {
  constructor(
    protected readonly s3Client: S3Client,
    protected readonly bucketName: string,
    protected readonly defaultPrefix: string,
  ) {}

  public async upload(
    cloudPath: string,
    options: ObjectStoragePresignedUploadOptions = {},
  ): Promise<ObjectStoragePresignedUploadResult> {
    const fullPath = resolveObjectStorageKey(this.defaultPrefix, cloudPath);
    const url = await this.signRequest({
      method: 'PUT',
      fullPath,
      expiresInSeconds: options.expiresInSeconds,
      contentType: options.contentType,
    });

    return {
      url,
      method: 'PUT',
      bucket: this.bucketName,
      pathToFile: fullPath,
      headers: options.contentType ? { 'Content-Type': options.contentType } : {},
    };
  }

  public async download(
    cloudPath: string,
    options: ObjectStoragePresignedDownloadOptions = {},
  ): Promise<string> {
    const fullPath = resolveObjectStorageKey(this.defaultPrefix, cloudPath);
    return this.signRequest({
      method: 'GET',
      fullPath,
      expiresInSeconds: options.expiresInSeconds,
    });
  }

  protected async signRequest(input: {
    method: 'GET' | 'PUT';
    fullPath: string;
    expiresInSeconds?: number;
    contentType?: string;
  }): Promise<string> {
    const expiresInSeconds = resolvePresignedExpirationSeconds(input.expiresInSeconds);

    const command =
      input.method === 'GET'
        ? new GetObjectCommand({
            Bucket: this.bucketName,
            Key: input.fullPath,
          })
        : new PutObjectCommand({
            Bucket: this.bucketName,
            Key: input.fullPath,
            ContentType: input.contentType,
          });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}
