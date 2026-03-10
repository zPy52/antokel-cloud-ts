import * as fs from 'fs';
import { Buffer } from 'buffer';
import { Source } from './types';
import { randomUUID } from 'crypto';
import { SubmoduleS3AsText } from './as-text';
import { SubmoduleS3Presigned } from './presigned';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { resolveS3Key } from './shared';

export const AsBase64 = Symbol('base64');
export const AsBytes = Symbol('bytes');

async function sourceToBuffer(source: Source): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    return source;
  }
  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }
  if (source instanceof ArrayBuffer) {
    return Buffer.from(source);
  }
  if (source instanceof URL) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to fetch source: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (typeof source === 'string') {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Failed to fetch source: ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    }
    if (source.startsWith('data:')) {
      const base64Index = source.indexOf('base64,');
      if (base64Index !== -1) {
        return Buffer.from(source.substring(base64Index + 7), 'base64');
      }
      return Buffer.from(source.split(',')[1] || '');
    }
    // Attempt to guess if base64 (no spaces, valid short base64 check)
    if (!/\s/.test(source) && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source)) {
      try {
        return Buffer.from(source, 'base64');
      } catch {
        // Fallback to plain string interpretation
      }
    }
    return Buffer.from(source);
  }
  throw new Error('Unsupported source type');
}

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
  public async upload(source: Source, key?: string): Promise<string> {
    const finalKey = key || randomUUID();
    const body = await sourceToBuffer(source);
    const resolvedKey = resolveS3Key(this.defaultPrefix, finalKey);

    let contentType = 'application/octet-stream';
    if (typeof source === 'string' && source.startsWith('data:')) {
      const match = source.match(/^data:(.*?);/);
      if (match && match[1]) {
        contentType = match[1];
      }
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: resolvedKey,
        Body: body,
        ContentType: contentType,
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
  S3PresignedDownloadOptions,
  S3PresignedUploadOptions,
  S3PresignedUploadResult,
} from './types';
