import { Hash } from '@smithy/hash-node';
import { S3Client } from '@aws-sdk/client-s3';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4MultiRegion } from '@aws-sdk/signature-v4-multi-region';
import type { AwsCredentialIdentity, HttpRequest as SignedHttpRequest } from '@smithy/types';
import {
  encodeS3Path,
  formatPresignedRequest,
  resolveBooleanConfig,
  resolveEndpointUrl,
} from './shared';
import {
  S3PresignedDownloadOptions,
  S3PresignedUploadOptions,
  S3PresignedUploadResult,
} from './types';

export class SubmoduleS3Presigned {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly defaultPrefix: string,
  ) {}

  public async upload(
    cloudPath: string,
    options: S3PresignedUploadOptions = {},
  ): Promise<S3PresignedUploadResult> {
    const fullPath = this.defaultPrefix + cloudPath;
    const signedRequest = await this.signRequest({
      method: 'PUT',
      fullPath,
      expiresInSeconds: options.expiresInSeconds,
      contentType: options.contentType,
    });

    return {
      url: formatPresignedRequest(signedRequest),
      method: 'PUT',
      bucket: this.bucketName,
      pathToFile: fullPath,
      headers: options.contentType ? { 'Content-Type': options.contentType } : {},
    };
  }

  public async download(
    cloudPath: string,
    options: S3PresignedDownloadOptions = {},
  ): Promise<string> {
    const fullPath = this.defaultPrefix + cloudPath;
    const signedRequest = await this.signRequest({
      method: 'GET',
      fullPath,
      expiresInSeconds: options.expiresInSeconds,
    });

    return formatPresignedRequest(signedRequest);
  }

  private async signRequest(input: {
    method: 'GET' | 'PUT';
    fullPath: string;
    expiresInSeconds?: number;
    contentType?: string;
  }): Promise<SignedHttpRequest> {
    const endpoint = await this.resolveEndpoint();
    const credentials = await this.s3Client.config.credentials();
    const region = await this.resolveRegion();
    const signer = this.createSigner(credentials, region);

    const request = new HttpRequest({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : undefined,
      method: input.method,
      path: `${endpoint.pathname.replace(/\/$/, '')}/${encodeS3Path(input.fullPath)}`,
      headers: input.contentType ? { 'content-type': input.contentType } : {},
    });

    return signer.presign(request, {
      expiresIn: input.expiresInSeconds ?? 900,
    });
  }

  private createSigner(credentials: AwsCredentialIdentity, region: string) {
    return new SignatureV4MultiRegion({
      credentials,
      region,
      service: 's3',
      sha256: Hash.bind(null, 'sha256'),
    });
  }

  private async resolveEndpoint(): Promise<URL> {
    const region = await this.resolveRegion();
    const configuredEndpoint = await resolveEndpointUrl(this.s3Client.config.endpoint);

    const resolved = await this.s3Client.config.endpointProvider({
      Bucket: this.bucketName,
      Region: region,
      Endpoint: configuredEndpoint?.toString(),
      ForcePathStyle: await resolveBooleanConfig(this.s3Client.config.forcePathStyle),
      UseArnRegion: await resolveBooleanConfig(this.s3Client.config.useArnRegion),
      DisableMultiRegionAccessPoints: await resolveBooleanConfig(
        this.s3Client.config.disableMultiregionAccessPoints,
      ),
      Accelerate: await resolveBooleanConfig(this.s3Client.config.useAccelerateEndpoint),
      DisableS3ExpressSessionAuth: await resolveBooleanConfig(
        this.s3Client.config.disableS3ExpressSessionAuth,
      ),
      UseGlobalEndpoint: await resolveBooleanConfig(this.s3Client.config.useGlobalEndpoint),
      UseFIPS: await resolveBooleanConfig(this.s3Client.config.useFipsEndpoint),
      UseDualStack: await resolveBooleanConfig(this.s3Client.config.useDualstackEndpoint),
    });

    return resolved.url;
  }

  private async resolveRegion(): Promise<string> {
    const region = await this.s3Client.config.region();
    return typeof region === 'string' ? region : String(region);
  }
}
