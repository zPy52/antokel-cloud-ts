import { S3Client } from '@aws-sdk/client-s3';
import { SubmoduleS3AsText } from './as-text';
import { SubmoduleS3Presigned } from './presigned';

export class S3Wrapper {
  public readonly asText: SubmoduleS3AsText;
  public readonly presigned: SubmoduleS3Presigned;

  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly defaultPrefix: string = '',
  ) {
    this.asText = new SubmoduleS3AsText(this.s3Client, this.bucketName, this.defaultPrefix);
    this.presigned = new SubmoduleS3Presigned(this.s3Client, this.bucketName, this.defaultPrefix);
  }
}

export { SubmoduleS3AsText } from './as-text';
export { SubmoduleS3Presigned } from './presigned';
export {
  S3PresignedDownloadOptions,
  S3PresignedUploadOptions,
  S3PresignedUploadResult,
} from './types';
