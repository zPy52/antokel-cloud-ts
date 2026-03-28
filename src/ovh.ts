import { S3Client } from '@aws-sdk/client-s3';
import { OvhObjectStorageWrapper } from './ovh/object-storage';
import { resolveOvhEndpoint, normalizeOvhRegion } from './ovh/object-storage/shared';
import { OvhConfig } from './ovh/types';

export class AntokelOVH {
  private readonly ovhConfig: OvhConfig;
  private _s3Client?: S3Client;

  constructor(config: OvhConfig) {
    this.ovhConfig = config;
  }

  private get region(): string {
    return normalizeOvhRegion(this.ovhConfig.region);
  }

  private createOvhClientConfig(): any {
    const cfg: any = {
      region: this.region,
      endpoint: resolveOvhEndpoint(this.region, this.ovhConfig.endpoint),
      forcePathStyle: true,
    };

    if (this.ovhConfig.accessKeyId && this.ovhConfig.secretAccessKey) {
      cfg.credentials = {
        accessKeyId: this.ovhConfig.accessKeyId,
        secretAccessKey: this.ovhConfig.secretAccessKey,
      };
    }

    return cfg;
  }

  private getS3Client(): S3Client {
    if (!this._s3Client) {
      this._s3Client = new S3Client(this.createOvhClientConfig());
    }

    return this._s3Client;
  }

  public ObjectStorage(bucketName: string, options?: { prefix?: string }): OvhObjectStorageWrapper {
    return new OvhObjectStorageWrapper(this.getS3Client(), bucketName, this.region, options?.prefix);
  }
}

export { OvhObjectStorageWrapper, SubmoduleOvhObjectStorageAsText, SubmoduleOvhObjectStoragePresigned } from './ovh/object-storage';
export type {
  OvhObjectStorageClass,
  OvhObjectStorageUploadOptions,
  OvhPresignedDownloadOptions,
  OvhPresignedUploadOptions,
  OvhPresignedUploadResult,
} from './ovh/object-storage';
export type { OvhConfig } from './ovh/types';
