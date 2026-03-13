import { S3Client } from '@aws-sdk/client-s3';
import { TranscribeClient } from '@aws-sdk/client-transcribe';
import { SubmoduleTranscribeAs } from './as';
import { TranscribeConfig } from './types';

export class TranscribeWrapper {
  public readonly as: SubmoduleTranscribeAs;

  constructor(
    private readonly transcribeClient: TranscribeClient,
    private readonly s3Client: S3Client,
    private readonly config?: TranscribeConfig,
  ) {
    this.as = new SubmoduleTranscribeAs(this.transcribeClient, this.s3Client, this.config);
  }
}

export { SubmoduleTranscribeAs } from './as';
export type {
  TranscribeBytesSource,
  TranscribeConfig,
  TranscribeLanguageOptions,
  TranscribeMediaFormat,
  TranscribeRequestOptions,
  TranscribeResult,
  TranscribeSegment,
  TranscribeToken,
  TranscribeWord,
} from './types';
