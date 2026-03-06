import { Readable } from 'stream';
import { createInterface } from 'readline';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class SubmoduleS3AsText {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly defaultPrefix: string,
  ) {}

  public async read(cloudPath: string): Promise<string> {
    const fullPath = this.defaultPrefix + cloudPath;
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
    const fullPath = this.defaultPrefix + cloudPath;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
        Body: content,
      }),
    );
  }

  public async *streamLines(cloudPath: string): AsyncGenerator<string, void, unknown> {
    const fullPath = this.defaultPrefix + cloudPath;
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
