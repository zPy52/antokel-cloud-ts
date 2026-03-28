import * as fs from 'fs';
import { Buffer } from 'buffer';
import { randomUUID } from 'crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AsBase64, AsBytes, resolveObjectStorageKey, resolveSourceContentType, sourceToBuffer } from '../../object-storage/shared';
import { SubmoduleOvhObjectStorageAsText } from './as-text';
import { SubmoduleOvhObjectStoragePresigned } from './presigned';
import {
  OvhObjectStorageClass,
  OvhObjectStorageUploadOptions,
  OvhPresignedDownloadOptions,
  OvhPresignedUploadOptions,
  OvhPresignedUploadResult,
  Source,
} from './types';
import { resolveOvhStorageClass } from './shared';

export class OvhObjectStorageWrapper {
  public readonly asText: SubmoduleOvhObjectStorageAsText;
  public readonly presigned: SubmoduleOvhObjectStoragePresigned;

  public readonly as = {
    base64: AsBase64,
    bytes: AsBytes,
  } as const;

  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly region: string,
    private readonly defaultPrefix: string = '',
  ) {
    this.asText = new SubmoduleOvhObjectStorageAsText(
      this.s3Client,
      this.bucketName,
      this.defaultPrefix,
    );
    this.presigned = new SubmoduleOvhObjectStoragePresigned(
      this.s3Client,
      this.bucketName,
      this.defaultPrefix,
    );
  }

  public async upload(
    source: Source,
    key?: string,
    options: OvhObjectStorageUploadOptions = {},
  ): Promise<string> {
    const finalKey = key || randomUUID();
    const body = await sourceToBuffer(source);
    const resolvedKey = resolveObjectStorageKey(this.defaultPrefix, finalKey);
    const storageClass = resolveOvhStorageClass(this.region, options.storageClass);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: resolvedKey,
        Body: body,
        ContentType: resolveSourceContentType(source),
        ...(storageClass ? { StorageClass: storageClass } : {}),
      }),
    );

    return finalKey;
  }

  public async download(key: string, destination: typeof AsBase64): Promise<string>;
  public async download(key: string, destination: typeof AsBytes): Promise<Buffer>;
  public async download(key: string, destination: string): Promise<void>;

  public async download(
    key: string,
    destination: string | typeof AsBase64 | typeof AsBytes,
  ): Promise<string | Buffer | void> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: resolveObjectStorageKey(this.defaultPrefix, key),
      }),
    );

    if (!response.Body) {
      throw new Error('Empty response body returned from OVH Object Storage');
    }

    const bytes = await response.Body.transformToByteArray();
    const buffer = Buffer.from(bytes);

    if (destination === AsBase64) {
      const mimeType = response.ContentType || 'application/octet-stream';
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    if (destination === AsBytes) {
      return buffer;
    }

    await fs.promises.writeFile(destination, buffer);
  }

  public async remove(cloudPath: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: resolveObjectStorageKey(this.defaultPrefix, cloudPath),
      }),
    );
  }

  public async move(from: string, to: string): Promise<void> {
    const sourceKey = resolveObjectStorageKey(this.defaultPrefix, from);
    const targetKey = resolveObjectStorageKey(this.defaultPrefix, to);

    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        Key: targetKey,
        CopySource: `${this.bucketName}/${sourceKey}`,
      }),
    );

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: sourceKey,
      }),
    );
  }
}

export { SubmoduleOvhObjectStorageAsText } from './as-text';
export { SubmoduleOvhObjectStoragePresigned } from './presigned';
export type {
  OvhObjectStorageClass,
  OvhObjectStorageUploadOptions,
  OvhPresignedDownloadOptions,
  OvhPresignedUploadOptions,
  OvhPresignedUploadResult,
  Source,
} from './types';
