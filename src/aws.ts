import { z } from 'zod';
import { S3Wrapper } from './s3';
import { Ec2Wrapper } from './ec2';
import { AwsConfig } from './dynamodb/types';
import { S3Client } from '@aws-sdk/client-s3';
import { EC2Client } from '@aws-sdk/client-ec2';
import { AntokelDynamoDb, TableConfig } from './dynamodb';
import { DynamoDbService } from './dynamodb/services/dynamodb-service';

export class AntokelAws {
  private awsConfig: AwsConfig;
  private _s3Client?: S3Client;
  private _ec2Client?: EC2Client;

  constructor(config?: AwsConfig) {
    this.awsConfig = config || {};

    // Auto-init dynamodb using current config
    DynamoDbService.initializeClient({
      region: this.awsConfig.region,
      accessKeyId: this.awsConfig.accessKeyId,
      secretAccessKey: this.awsConfig.secretAccessKey,
    });
  }

  private getS3Client(): S3Client {
    if (!this._s3Client) {
      const cfg: any = { region: this.awsConfig.region || process.env.AWS_REGION || 'us-east-1' };
      if (this.awsConfig.accessKeyId && this.awsConfig.secretAccessKey) {
        cfg.credentials = {
          accessKeyId: this.awsConfig.accessKeyId,
          secretAccessKey: this.awsConfig.secretAccessKey,
        };
      }
      this._s3Client = new S3Client(cfg);
    }
    return this._s3Client;
  }

  private getEc2Client(): EC2Client {
    if (!this._ec2Client) {
      const cfg: any = { region: this.awsConfig.region || process.env.AWS_REGION || 'us-east-1' };
      if (this.awsConfig.accessKeyId && this.awsConfig.secretAccessKey) {
        cfg.credentials = {
          accessKeyId: this.awsConfig.accessKeyId,
          secretAccessKey: this.awsConfig.secretAccessKey,
        };
      }
      this._ec2Client = new EC2Client(cfg);
    }
    return this._ec2Client;
  }

  /**
   * Generates an S3 wrapper.
   */
  public S3(bucketName: string, options?: { prefix?: string }): S3Wrapper {
    return new S3Wrapper(this.getS3Client(), bucketName, options?.prefix);
  }

  /**
   * Generates an EC2 service facade.
   */
  public EC2(): Ec2Wrapper {
    return new Ec2Wrapper(this.getEc2Client());
  }

  /**
   * Generates a type-safe DynamoDB ORM table mapper.
   */
  public Dynamo<T extends z.ZodTypeAny>(config: TableConfig<T>): AntokelDynamoDb<T> {
    return new AntokelDynamoDb<T>(config);
  }
}

export * from './dynamodb';
export { S3Wrapper, SubmoduleS3AsText, SubmoduleS3Presigned } from './s3';
export { Ec2Wrapper, SubmoduleEc2Instance, Ec2InstanceConfig } from './ec2';
