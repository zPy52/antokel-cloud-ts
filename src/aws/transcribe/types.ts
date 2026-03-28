import { Buffer } from 'buffer';

export type TranscribeMediaFormat =
  | 'amr'
  | 'flac'
  | 'm4a'
  | 'mp3'
  | 'mp4'
  | 'ogg'
  | 'wav'
  | 'webm';

export type TranscribeBytesSource = Buffer | Uint8Array | ArrayBuffer;

export type TranscribeLanguageOptions =
  | { languageCode: string; identifyLanguage?: never }
  | { languageCode?: never; identifyLanguage: true };

export interface TranscribeConfig {
  stagingBucket?: string;
  stagingPrefix?: string;
  outputBucket?: string;
  outputPrefix?: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  cleanupStagedMedia?: boolean;
}

export type TranscribeRequestOptions = TranscribeLanguageOptions & {
  mediaFormat: TranscribeMediaFormat;
  sampleRateHertz?: number;
  jobName?: string;
  stagingBucket?: string;
  stagingPrefix?: string;
  outputBucket?: string;
  outputPrefix?: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  cleanupStagedMedia?: boolean;
};

export interface TranscribeToken {
  id: number;
  type: 'pronunciation' | 'punctuation';
  content: string;
  confidence: number | null;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
}

export interface TranscribeWord {
  id: number;
  content: string;
  confidence: number | null;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

export interface TranscribeSegment {
  id: number;
  transcript: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  itemIds: number[];
}

export interface TranscribeResult {
  jobName: string;
  languageCode?: string;
  text: string;
  sourceMediaUri: string;
  transcriptFileUri: string;
  tokens: TranscribeToken[];
  words: TranscribeWord[];
  segments: TranscribeSegment[];
}
