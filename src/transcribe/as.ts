import { S3Client } from '@aws-sdk/client-s3';
import { StartTranscriptionJobCommand, TranscribeClient } from '@aws-sdk/client-transcribe';
import {
  TranscribeBytesSource,
  TranscribeConfig,
  TranscribeRequestOptions,
  TranscribeResult,
} from './types';
import {
  buildStartJobInput,
  decodeBase64Audio,
  downloadTranscriptDocument,
  removeStagedTranscribeMedia,
  resolveMediaUri,
  resolveTranscribeExecutionOptions,
  stageTranscribeMedia,
  toBuffer,
  toTranscribeResult,
  waitForTranscriptionJob,
} from './shared';

export class SubmoduleTranscribeAs {
  constructor(
    private readonly transcribeClient: TranscribeClient,
    private readonly s3Client: S3Client,
    private readonly config?: TranscribeConfig,
  ) {}

  public async uri(
    mediaUri: string | URL,
    options: TranscribeRequestOptions,
  ): Promise<TranscribeResult> {
    const resolvedMediaUri = resolveMediaUri(mediaUri);
    const executionOptions = resolveTranscribeExecutionOptions(this.config, options);

    await this.transcribeClient.send(
      new StartTranscriptionJobCommand(buildStartJobInput(resolvedMediaUri, executionOptions)),
    );

    const job = await waitForTranscriptionJob(this.transcribeClient, executionOptions);
    const transcriptFileUri = job.Transcript?.TranscriptFileUri;
    if (!transcriptFileUri) {
      throw new Error(`Transcription job "${executionOptions.jobName}" completed without a transcript URI.`);
    }

    const transcript = await downloadTranscriptDocument({
      jobName: executionOptions.jobName,
      transcriptFileUri,
      transcribeClient: this.transcribeClient,
      s3Client: this.s3Client,
    });

    return toTranscribeResult({
      document: transcript.document,
      jobName: executionOptions.jobName,
      languageCode: job.LanguageCode,
      sourceMediaUri: resolvedMediaUri,
      transcriptFileUri: transcript.transcriptFileUri,
    });
  }

  public async bytes(
    source: TranscribeBytesSource,
    options: TranscribeRequestOptions,
  ): Promise<TranscribeResult> {
    const executionOptions = resolveTranscribeExecutionOptions(this.config, options);
    const stagedMedia = await stageTranscribeMedia(this.s3Client, toBuffer(source), executionOptions);

    try {
      return await this.uri(stagedMedia.mediaUri, {
        ...options,
        jobName: executionOptions.jobName,
        stagingBucket: executionOptions.stagingBucket,
        stagingPrefix: executionOptions.stagingPrefix,
        outputBucket: executionOptions.outputBucket,
        outputPrefix: executionOptions.outputPrefix,
        pollIntervalMs: executionOptions.pollIntervalMs,
        maxWaitMs: executionOptions.maxWaitMs,
        cleanupStagedMedia: executionOptions.cleanupStagedMedia,
      });
    } finally {
      if (executionOptions.cleanupStagedMedia) {
        await removeStagedTranscribeMedia(this.s3Client, stagedMedia);
      }
    }
  }

  public async base64(
    source: string,
    options: TranscribeRequestOptions,
  ): Promise<TranscribeResult> {
    return this.bytes(decodeBase64Audio(source), options);
  }
}
