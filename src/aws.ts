import { z } from 'zod';
import { S3Client } from '@aws-sdk/client-s3';
import { EC2Client } from '@aws-sdk/client-ec2';
import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { TranscribeClient } from '@aws-sdk/client-transcribe';
import { AntokelDynamoDb, TableConfig } from './aws/dynamodb';
import { AwsConfig } from './aws/dynamodb/types';
import { DynamoDbService } from './aws/dynamodb/services/dynamodb-service';
import { Ec2Wrapper } from './aws/ec2';
import { SubmoduleRekognition } from './aws/rekognition';
import { S3Wrapper } from './aws/s3';
import { TranscribeConfig, TranscribeWrapper } from './aws/transcribe';

export class AntokelAws {
  private awsConfig: AwsConfig;
  private _s3Client?: S3Client;
  private _ec2Client?: EC2Client;
  private _rekognitionClient?: RekognitionClient;
  private _transcribeClient?: TranscribeClient;

  constructor(config?: AwsConfig) {
    this.awsConfig = config || {};

    // Auto-init dynamodb using current config
    DynamoDbService.initializeClient({
      region: this.awsConfig.region,
      accessKeyId: this.awsConfig.accessKeyId,
      secretAccessKey: this.awsConfig.secretAccessKey,
    });
  }

  private createAwsClientConfig(): any {
    const cfg: any = { region: this.awsConfig.region || process.env.AWS_REGION || 'us-east-1' };
    if (this.awsConfig.accessKeyId && this.awsConfig.secretAccessKey) {
      cfg.credentials = {
        accessKeyId: this.awsConfig.accessKeyId,
        secretAccessKey: this.awsConfig.secretAccessKey,
      };
    }

    return cfg;
  }

  private getS3Client(): S3Client {
    if (!this._s3Client) {
      this._s3Client = new S3Client(this.createAwsClientConfig());
    }
    return this._s3Client;
  }

  private getEc2Client(): EC2Client {
    if (!this._ec2Client) {
      this._ec2Client = new EC2Client(this.createAwsClientConfig());
    }
    return this._ec2Client;
  }

  private getRekognitionClient(): RekognitionClient {
    if (!this._rekognitionClient) {
      this._rekognitionClient = new RekognitionClient(this.createAwsClientConfig());
    }
    return this._rekognitionClient;
  }

  private getTranscribeClient(): TranscribeClient {
    if (!this._transcribeClient) {
      this._transcribeClient = new TranscribeClient(this.createAwsClientConfig());
    }
    return this._transcribeClient;
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
   * Generates a Rekognition service facade.
   */
  public Rekognition(): SubmoduleRekognition {
    return new SubmoduleRekognition(this.getRekognitionClient());
  }

  /**
   * Generates a Transcribe service facade.
   */
  public Transcribe(config?: TranscribeConfig): TranscribeWrapper {
    return new TranscribeWrapper(this.getTranscribeClient(), this.getS3Client(), config);
  }

  /**
   * Generates a type-safe DynamoDB ORM table mapper.
   */
  public Dynamo<T extends z.ZodTypeAny>(config: TableConfig<T>): AntokelDynamoDb<T> {
    return new AntokelDynamoDb<T>(config);
  }
}

export * from './aws/dynamodb';
export { S3Wrapper, SubmoduleS3AsText, SubmoduleS3Presigned } from './aws/s3';
export { Ec2Wrapper, SubmoduleEc2Instance } from './aws/ec2';
export type { Ec2InstanceConfig } from './aws/ec2';
export * from './aws/rekognition';
export * from './aws/transcribe';
