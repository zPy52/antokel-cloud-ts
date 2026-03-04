import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync } from "fs";
import { Readable } from "stream";
import { createInterface } from "readline";

export class SubmoduleS3AsText {
  constructor(private s3Client: S3Client, private bucketName: string, private defaultPrefix: string) {}

  public async read(cloudPath: string): Promise<string> {
    const fullPath = this.defaultPrefix + cloudPath;
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
      })
    );

    if (!response.Body) return "";
    return response.Body.transformToString();
  }

  public async write(content: string, cloudPath: string): Promise<void> {
    const fullPath = this.defaultPrefix + cloudPath;
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
        Body: content,
      })
    );
  }

  public async *streamLines(cloudPath: string): AsyncGenerator<string, void, unknown> {
    const fullPath = this.defaultPrefix + cloudPath;
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
      })
    );

    if (!response.Body) return;

    // Node.js stream integration
    const bodyStream = response.Body as unknown as Readable; 
    const rl = createInterface({
      input: bodyStream,
      crlfDelay: Infinity, // Recognizes all instances of CR LF ('\r\n') as a single line break
    });

    for await (const line of rl) {
      yield line;
    }
  }
}

export class S3Wrapper {
  private asTextSubmodule: SubmoduleS3AsText;

  constructor(private s3Client: S3Client, private bucketName: string, private defaultPrefix: string = "") {
    this.asTextSubmodule = new SubmoduleS3AsText(this.s3Client, this.bucketName, this.defaultPrefix);
  }

  public get asText() {
    return this.asTextSubmodule;
  }

  public async upload(localPath: string, cloudPath: string): Promise<void> {
    const content = readFileSync(localPath);
    const fullPath = this.defaultPrefix + cloudPath;
    
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
        Body: content,
      })
    );
  }

  public async download(cloudPath: string, localPath: string): Promise<void> {
    const fullPath = this.defaultPrefix + cloudPath;
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
      })
    );

    if (!response.Body) return;

    const byteArray = await response.Body.transformToByteArray();
    writeFileSync(localPath, byteArray);
  }

  public async remove(cloudPath: string): Promise<void> {
    const fullPath = this.defaultPrefix + cloudPath;
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fullPath,
      })
    );
  }

  public async move(oldCloudPath: string, newCloudPath: string): Promise<void> {
    const fullOldPath = this.defaultPrefix + oldCloudPath;
    const fullNewPath = this.defaultPrefix + newCloudPath;

    // Copy
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${fullOldPath}`,
        Key: fullNewPath,
      })
    );

    // Delete
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: fullOldPath,
      })
    );
  }
}
