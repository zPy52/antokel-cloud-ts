import * as fs from 'fs';
import { Buffer } from 'buffer';
import { randomUUID } from 'crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  StorageClass,
} from '@aws-sdk/client-s3';
import { AsBase64, AsBytes, resolveSourceContentType, sourceToBuffer } from '../../object-storage/shared';
import { SubmoduleS3AsText } from './as-text';
import { SubmoduleS3Presigned } from './presigned';
import { S3StorageClass, S3UploadOptions, Source } from './types';
import { resolveS3Key } from './shared';

const STORAGE_CLASS_MAP: Record<S3StorageClass, StorageClass> = {
  standard: StorageClass.STANDARD,
  standard_ia: StorageClass.STANDARD_IA,
  onezone_ia: StorageClass.ONEZONE_IA,
  intelligent_tiering: StorageClass.INTELLIGENT_TIERING,
  glacier_ir: StorageClass.GLACIER_IR,
  glacier: StorageClass.GLACIER,
  deep_archive: StorageClass.DEEP_ARCHIVE,
  express_onezone: StorageClass.EXPRESS_ONEZONE,
};

export class S3Wrapper {
  public readonly asText: SubmoduleS3AsText;
  public readonly presigned: SubmoduleS3Presigned;

  public readonly as = {
    base64: AsBase64,
    bytes: AsBytes,
  } as const;

  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly defaultPrefix: string = '',
  ) {
    this.asText = new SubmoduleS3AsText(this.s3Client, this.bucketName, this.defaultPrefix);
    this.presigned = new SubmoduleS3Presigned(this.s3Client, this.bucketName, this.defaultPrefix);
  }

  /**
   * Upload an object to S3.
   * If a key is not provided, a random UUID will be used.
   */
  public async upload(source: Source, key?: string, options: S3UploadOptions = {}): Promise<string> {
    const finalKey = key || randomUUID();
    const body = await sourceToBuffer(source);
    const resolvedKey = resolveS3Key(this.defaultPrefix, finalKey);
    const contentType = resolveSourceContentType(source);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: resolvedKey,
        Body: body,
        ContentType: contentType,
        ...(options.storageClass
          ? { StorageClass: STORAGE_CLASS_MAP[options.storageClass] }
          : {}),
      }),
    );
    return finalKey;
  }

  /**
   * Download a file from S3 as a base64 data-URL string.
   */
  public async download(key: string, destination: typeof AsBase64): Promise<string>;
  
  /**
   * Download a file from S3 as a byte buffer.
   */
  public async download(key: string, destination: typeof AsBytes): Promise<Buffer>;
  
  /**
   * Download a file from S3 to a local destination path.
   */
  public async download(key: string, destination: string): Promise<void>;
  
  public async download(
    key: string,
    destination: string | typeof AsBase64 | typeof AsBytes,
  ): Promise<string | Buffer | void> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: resolveS3Key(this.defaultPrefix, key),
    });

    const response = await this.s3Client.send(command);
    if (!response.Body) {
      throw new Error('Empty response body returned from S3');
    }

    const bytes = await response.Body.transformToByteArray();
    const buffer = Buffer.from(bytes);

    if (destination === AsBase64) {
      const mimeType = response.ContentType || 'application/octet-stream';
      const b64 = buffer.toString('base64');
      return `data:${mimeType};base64,${b64}`;
    }

    if (destination === AsBytes) {
      return buffer;
    }

    // Save to local path
    await fs.promises.writeFile(destination as string, buffer);
  }

  public async remove(cloudPath: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: resolveS3Key(this.defaultPrefix, cloudPath),
      }),
    );
  }

  public async move(from: string, to: string): Promise<void> {
    const sourceKey = resolveS3Key(this.defaultPrefix, from);
    const targetKey = resolveS3Key(this.defaultPrefix, to);

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

export { SubmoduleS3AsText } from './as-text';
export { SubmoduleS3Presigned } from './presigned';
export type {
  Source,
  S3StorageClass,
  S3UploadOptions,
  S3PresignedDownloadOptions,
  S3PresignedUploadOptions,
  S3PresignedUploadResult,
} from './types';
