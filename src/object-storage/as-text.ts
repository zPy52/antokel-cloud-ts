import { Readable } from 'stream';
import { createInterface } from 'readline';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolveObjectStorageKey } from './shared';

export class ObjectStorageAsTextModule {
  constructor(
    protected readonly s3Client: S3Client,
    protected readonly bucketName: string,
    protected readonly defaultPrefix: string,
  ) {}

  public async read(cloudPath: string): Promise<string> {
    const fullPath = resolveObjectStorageKey(this.defaultPrefix, cloudPath);
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
      }),
    );

    if (!response.Body) {
      return '';
    }

    return response.Body.transformToString();
  }

  public async write(content: string, cloudPath: string): Promise<void> {
    const fullPath = resolveObjectStorageKey(this.defaultPrefix, cloudPath);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
        Body: content,
      }),
    );
  }

  public async *streamLines(cloudPath: string): AsyncGenerator<string, void, unknown> {
    const fullPath = resolveObjectStorageKey(this.defaultPrefix, cloudPath);
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
      }),
    );

    if (!response.Body) {
      return;
    }

    const bodyStream = response.Body as unknown as Readable;
    const lineReader = createInterface({
      input: bodyStream,
      crlfDelay: Infinity,
    });

    for await (const line of lineReader) {
      yield line;
    }
  }
}
