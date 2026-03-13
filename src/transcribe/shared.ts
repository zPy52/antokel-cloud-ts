import { Buffer } from 'buffer';
import { randomUUID } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  GetTranscriptionJobCommand,
  MediaFormat,
  StartTranscriptionJobCommandInput,
  TranscribeClient,
  TranscriptionJob,
} from '@aws-sdk/client-transcribe';
import { resolveS3Key } from '../s3/shared';
import {
  TranscribeBytesSource,
  TranscribeConfig,
  TranscribeRequestOptions,
  TranscribeResult,
  TranscribeSegment,
  TranscribeToken,
  TranscribeWord,
} from './types';

interface AwsTranscriptAlternative {
  content?: string;
  confidence?: string;
}

interface AwsTranscriptItem {
  type?: string;
  alternatives?: AwsTranscriptAlternative[];
  start_time?: string;
  end_time?: string;
}

interface AwsTranscriptAudioSegment {
  transcript?: string;
  start_time?: string;
  end_time?: string;
  items?: Array<string | number>;
}

interface AwsTranscriptDocument {
  results?: {
    transcripts?: Array<{ transcript?: string }>;
    items?: AwsTranscriptItem[];
    audio_segments?: AwsTranscriptAudioSegment[];
    language_code?: string;
  };
}

interface TranscribeExecutionOptions {
  jobName: string;
  mediaFormat: MediaFormat;
  sampleRateHertz?: number;
  languageCode?: string;
  identifyLanguage?: true;
  stagingBucket?: string;
  stagingPrefix?: string;
  outputBucket?: string;
  outputPrefix?: string;
  pollIntervalMs: number;
  maxWaitMs?: number;
  cleanupStagedMedia: boolean;
}

interface DownloadTranscriptInput {
  jobName: string;
  transcriptFileUri: string;
  transcribeClient: TranscribeClient;
  s3Client: S3Client;
}

interface ToResultInput {
  document: AwsTranscriptDocument;
  jobName: string;
  languageCode?: string;
  sourceMediaUri: string;
  transcriptFileUri: string;
}

interface S3UriParts {
  bucket: string;
  key: string;
}

export interface StagedTranscribeMedia {
  bucket: string;
  key: string;
  mediaUri: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFiniteNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function joinTokens(tokens: Array<Pick<TranscribeToken, 'content' | 'type'>>): string {
  let text = '';

  for (const token of tokens) {
    if (!token.content) {
      continue;
    }

    if (token.type === 'punctuation') {
      text += token.content;
      continue;
    }

    text += text ? ` ${token.content}` : token.content;
  }

  return text;
}

function parseS3Uri(uri: string): S3UriParts {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }

  return {
    bucket: match[1],
    key: match[2],
  };
}

function getAudioContentType(mediaFormat: string): string {
  switch (mediaFormat) {
    case 'mp3':
      return 'audio/mpeg';
    case 'mp4':
    case 'm4a':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'webm':
      return 'audio/webm';
    case 'flac':
      return 'audio/flac';
    case 'amr':
      return 'audio/amr';
    default:
      return 'application/octet-stream';
  }
}

async function readS3BodyAsString(body: any): Promise<string> {
  if (typeof body?.transformToString === 'function') {
    return body.transformToString();
  }

  if (typeof body?.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes).toString('utf-8');
  }

  throw new Error('Unable to read S3 response body.');
}

async function downloadTranscriptDocumentFromUri(
  transcriptFileUri: string,
  s3Client: S3Client,
): Promise<AwsTranscriptDocument> {
  if (transcriptFileUri.startsWith('s3://')) {
    const { bucket, key } = parseS3Uri(transcriptFileUri);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error(`Empty transcript body returned from ${transcriptFileUri}`);
    }

    const text = await readS3BodyAsString(response.Body);
    return JSON.parse(text) as AwsTranscriptDocument;
  }

  const response = await fetch(transcriptFileUri);
  if (!response.ok) {
    throw new Error(`Failed to download transcript: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as AwsTranscriptDocument;
}

export function generateTranscribeJobName(jobName?: string): string {
  return jobName ?? `antokel-transcribe-${Date.now()}-${randomUUID()}`;
}

export function decodeBase64Audio(source: string): Buffer {
  const payload = source.startsWith('data:')
    ? source.slice(source.indexOf(',') + 1)
    : source;
  const clean = payload.replace(/\s/g, '');
  const isValidBase64 =
    clean.length > 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean);

  if (!isValidBase64) {
    throw new Error('Invalid base64 audio payload.');
  }

  return Buffer.from(clean, 'base64');
}

export function toBuffer(source: TranscribeBytesSource): Buffer {
  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  if (source instanceof ArrayBuffer) {
    return Buffer.from(source);
  }

  throw new Error('Unsupported binary audio payload.');
}

export function resolveTranscribeExecutionOptions(
  config: TranscribeConfig | undefined,
  options: TranscribeRequestOptions,
): TranscribeExecutionOptions {
  const hasLanguageCode = typeof options.languageCode === 'string' && options.languageCode.length > 0;
  const hasIdentifyLanguage = options.identifyLanguage === true;

  if (hasLanguageCode === hasIdentifyLanguage) {
    throw new Error(
      'Provide exactly one of "languageCode" or "identifyLanguage" when starting a transcription job.',
    );
  }

  return {
    jobName: generateTranscribeJobName(options.jobName),
    mediaFormat: options.mediaFormat as MediaFormat,
    sampleRateHertz: options.sampleRateHertz,
    languageCode: options.languageCode,
    identifyLanguage: options.identifyLanguage,
    stagingBucket: options.stagingBucket ?? config?.stagingBucket,
    stagingPrefix: options.stagingPrefix ?? config?.stagingPrefix,
    outputBucket: options.outputBucket ?? config?.outputBucket,
    outputPrefix: options.outputPrefix ?? config?.outputPrefix,
    pollIntervalMs: options.pollIntervalMs ?? config?.pollIntervalMs ?? 5000,
    maxWaitMs: options.maxWaitMs ?? config?.maxWaitMs,
    cleanupStagedMedia: options.cleanupStagedMedia ?? config?.cleanupStagedMedia ?? true,
  };
}

export function resolveMediaUri(mediaUri: string | URL): string {
  const value = mediaUri instanceof URL ? mediaUri.toString() : mediaUri;
  if (/^s3:\/\/.+/.test(value) || /^https?:\/\/.+/.test(value)) {
    return value;
  }

  throw new Error(
    'transcribe.as.uri(...) only accepts s3:// or http(s):// media URIs. Use transcribe.as.base64(...) or transcribe.as.bytes(...) for raw audio payloads.',
  );
}

export function buildStartJobInput(
  mediaUri: string,
  options: TranscribeExecutionOptions,
): StartTranscriptionJobCommandInput {
  const input: StartTranscriptionJobCommandInput = {
    TranscriptionJobName: options.jobName,
    Media: {
      MediaFileUri: mediaUri,
    },
    MediaFormat: options.mediaFormat,
  };

  if (options.languageCode) {
    input.LanguageCode = options.languageCode;
  }

  if (options.identifyLanguage) {
    input.IdentifyLanguage = true;
  }

  if (options.sampleRateHertz !== undefined) {
    input.MediaSampleRateHertz = options.sampleRateHertz;
  }

  if (options.outputBucket) {
    input.OutputBucketName = options.outputBucket;
    input.OutputKey = resolveS3Key(options.outputPrefix, `${options.jobName}.json`);
  }

  return input;
}

export async function stageTranscribeMedia(
  s3Client: S3Client,
  body: Buffer,
  options: TranscribeExecutionOptions,
): Promise<StagedTranscribeMedia> {
  if (!options.stagingBucket) {
    throw new Error(
      'transcribe.as.bytes(...) and transcribe.as.base64(...) require a stagingBucket in aws.Transcribe(...) or the per-call options.',
    );
  }

  const key = resolveS3Key(options.stagingPrefix, `${options.jobName}.${options.mediaFormat}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: options.stagingBucket,
      Key: key,
      Body: body,
      ContentType: getAudioContentType(options.mediaFormat),
    }),
  );

  return {
    bucket: options.stagingBucket,
    key,
    mediaUri: `s3://${options.stagingBucket}/${key}`,
  };
}

export async function removeStagedTranscribeMedia(
  s3Client: S3Client,
  media: StagedTranscribeMedia,
): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: media.bucket,
      Key: media.key,
    }),
  );
}

export async function waitForTranscriptionJob(
  transcribeClient: TranscribeClient,
  options: Pick<TranscribeExecutionOptions, 'jobName' | 'pollIntervalMs' | 'maxWaitMs'>,
): Promise<TranscriptionJob> {
  const startedAt = Date.now();

  while (true) {
    const response = await transcribeClient.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: options.jobName,
      }),
    );

    const job = response.TranscriptionJob;
    if (!job) {
      throw new Error(`Transcription job "${options.jobName}" was not found.`);
    }

    if (job.TranscriptionJobStatus === 'COMPLETED') {
      return job;
    }

    if (job.TranscriptionJobStatus === 'FAILED') {
      throw new Error(
        `Transcription job "${options.jobName}" failed: ${job.FailureReason ?? 'Unknown failure.'}`,
      );
    }

    if (options.maxWaitMs !== undefined && Date.now() - startedAt >= options.maxWaitMs) {
      throw new Error(`Timed out waiting for transcription job "${options.jobName}" to complete.`);
    }

    await sleep(options.pollIntervalMs);
  }
}

export async function downloadTranscriptDocument(
  input: DownloadTranscriptInput,
): Promise<{ transcriptFileUri: string; document: AwsTranscriptDocument }> {
  try {
    return {
      transcriptFileUri: input.transcriptFileUri,
      document: await downloadTranscriptDocumentFromUri(input.transcriptFileUri, input.s3Client),
    };
  } catch (error) {
    if (!/^https?:\/\//.test(input.transcriptFileUri)) {
      throw error;
    }

    const refreshed = await input.transcribeClient.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: input.jobName,
      }),
    );
    const refreshedUri = refreshed.TranscriptionJob?.Transcript?.TranscriptFileUri;

    if (!refreshedUri) {
      throw error;
    }

    return {
      transcriptFileUri: refreshedUri,
      document: await downloadTranscriptDocumentFromUri(refreshedUri, input.s3Client),
    };
  }
}

export function toTranscribeResult(input: ToResultInput): TranscribeResult {
  const items = input.document.results?.items ?? [];
  const tokens: TranscribeToken[] = items.map((item, index) => {
    const alternative = item.alternatives?.[0];
    return {
      id: index,
      type: item.type === 'punctuation' ? 'punctuation' : 'pronunciation',
      content: alternative?.content ?? '',
      confidence: alternative?.confidence !== undefined ? Number(alternative.confidence) : null,
      startTimeSeconds: toFiniteNumber(item.start_time),
      endTimeSeconds: toFiniteNumber(item.end_time),
    };
  });

  const words: TranscribeWord[] = tokens
    .filter(
      (
        token,
      ): token is TranscribeToken & {
        type: 'pronunciation';
        startTimeSeconds: number;
        endTimeSeconds: number;
      } =>
        token.type === 'pronunciation' &&
        token.startTimeSeconds !== null &&
        token.endTimeSeconds !== null,
    )
    .map((token) => ({
      id: token.id,
      content: token.content,
      confidence: token.confidence,
      startTimeSeconds: token.startTimeSeconds,
      endTimeSeconds: token.endTimeSeconds,
    }));

  const segments: TranscribeSegment[] = (input.document.results?.audio_segments ?? []).map(
    (segment, index) => {
      const itemIds = (segment.items ?? [])
        .map((itemId) => Number(itemId))
        .filter((itemId) => Number.isFinite(itemId));
      const segmentTokens = itemIds
        .map((itemId) => tokens[itemId])
        .filter((token): token is TranscribeToken => Boolean(token));
      const firstWord = segmentTokens.find((token) => token.startTimeSeconds !== null);
      const lastWord = [...segmentTokens].reverse().find((token) => token.endTimeSeconds !== null);

      return {
        id: index,
        transcript: segment.transcript ?? joinTokens(segmentTokens),
        startTimeSeconds:
          toFiniteNumber(segment.start_time) ?? firstWord?.startTimeSeconds ?? 0,
        endTimeSeconds: toFiniteNumber(segment.end_time) ?? lastWord?.endTimeSeconds ?? 0,
        itemIds,
      };
    },
  );

  return {
    jobName: input.jobName,
    languageCode: input.languageCode ?? input.document.results?.language_code,
    text: input.document.results?.transcripts?.[0]?.transcript ?? joinTokens(tokens),
    sourceMediaUri: input.sourceMediaUri,
    transcriptFileUri: input.transcriptFileUri,
    tokens,
    words,
    segments,
  };
}
