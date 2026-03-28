import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
} from '@aws-sdk/client-transcribe';

import {
  AntokelAws,
  SubmoduleTranscribeAs,
  TranscribeWrapper,
} from '../src';
import { TranscribeWrapper as DirectTranscribeWrapper } from '../src/aws/transcribe';

function createBody(text: string) {
  const bytes = Buffer.from(text);
  return {
    async transformToString() {
      return text;
    },
    async transformToByteArray() {
      return Uint8Array.from(bytes);
    },
  };
}

function createTranscribeClient(sendImpl?: (command: unknown) => Promise<unknown>) {
  return {
    send: sendImpl ?? (async () => ({})),
    config: {},
  } as any;
}

function createS3Client(sendImpl?: (command: unknown) => Promise<unknown>) {
  return {
    send: sendImpl ?? (async () => ({})),
    config: {},
  } as any;
}

function createTranscriptDocument() {
  return {
    results: {
      transcripts: [{ transcript: 'hello world.' }],
      language_code: 'en-US',
      items: [
        {
          type: 'pronunciation',
          start_time: '0.0',
          end_time: '0.4',
          alternatives: [{ content: 'hello', confidence: '0.98' }],
        },
        {
          type: 'pronunciation',
          start_time: '0.5',
          end_time: '0.9',
          alternatives: [{ content: 'world', confidence: '0.97' }],
        },
        {
          type: 'punctuation',
          alternatives: [{ content: '.', confidence: '1.0' }],
        },
      ],
      audio_segments: [
        {
          transcript: 'hello world.',
          start_time: '0.0',
          end_time: '0.9',
          items: ['0', '1', '2'],
        },
      ],
    },
  };
}

test('AntokelAws.Transcribe returns a wrapper with transcribe.as and reuses its client', () => {
  const aws = new AntokelAws({ region: 'us-east-1' });

  const first = aws.Transcribe();
  const firstClient = (aws as any)._transcribeClient;
  const second = aws.Transcribe();

  assert.ok(first instanceof TranscribeWrapper);
  assert.ok(first.as instanceof SubmoduleTranscribeAs);
  assert.ok(second instanceof TranscribeWrapper);
  assert.ok(firstClient);
  assert.equal((aws as any)._transcribeClient, firstClient);
});

test('transcribe.as.uri starts a job and parses the final transcript payload', async () => {
  const transcribeCommands: unknown[] = [];
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push(url);

    return {
      ok: true,
      async json() {
        return createTranscriptDocument();
      },
    } as Response;
  }) as typeof fetch;

  try {
    const wrapper = new DirectTranscribeWrapper(
      createTranscribeClient(async (command) => {
        transcribeCommands.push(command);

        if (command instanceof GetTranscriptionJobCommand) {
          return {
            TranscriptionJob: {
              TranscriptionJobStatus: 'COMPLETED',
              LanguageCode: 'en-US',
              Transcript: {
                TranscriptFileUri: 'https://example.com/transcript.json',
              },
            },
          };
        }

        return {};
      }),
      createS3Client(),
    );

    const result = await wrapper.as.uri('s3://media-bucket/audio.mp3', {
      mediaFormat: 'mp3',
      languageCode: 'en-US',
      jobName: 'job-uri',
      outputBucket: 'out-bucket',
      outputPrefix: 'results',
    });

    const start = transcribeCommands.find(
      (command) => command instanceof StartTranscriptionJobCommand,
    ) as StartTranscriptionJobCommand;

    assert.ok(start);
    assert.deepEqual(start.input, {
      TranscriptionJobName: 'job-uri',
      Media: {
        MediaFileUri: 's3://media-bucket/audio.mp3',
      },
      MediaFormat: 'mp3',
      LanguageCode: 'en-US',
      OutputBucketName: 'out-bucket',
      OutputKey: 'results/job-uri.json',
    });
    assert.deepEqual(fetchCalls, ['https://example.com/transcript.json']);
    assert.equal(result.text, 'hello world.');
    assert.equal(result.languageCode, 'en-US');
    assert.deepEqual(result.tokens, [
      {
        id: 0,
        type: 'pronunciation',
        content: 'hello',
        confidence: 0.98,
        startTimeSeconds: 0,
        endTimeSeconds: 0.4,
      },
      {
        id: 1,
        type: 'pronunciation',
        content: 'world',
        confidence: 0.97,
        startTimeSeconds: 0.5,
        endTimeSeconds: 0.9,
      },
      {
        id: 2,
        type: 'punctuation',
        content: '.',
        confidence: 1,
        startTimeSeconds: null,
        endTimeSeconds: null,
      },
    ]);
    assert.deepEqual(result.words, [
      {
        id: 0,
        content: 'hello',
        confidence: 0.98,
        startTimeSeconds: 0,
        endTimeSeconds: 0.4,
      },
      {
        id: 1,
        content: 'world',
        confidence: 0.97,
        startTimeSeconds: 0.5,
        endTimeSeconds: 0.9,
      },
    ]);
    assert.deepEqual(result.segments, [
      {
        id: 0,
        transcript: 'hello world.',
        startTimeSeconds: 0,
        endTimeSeconds: 0.9,
        itemIds: [0, 1, 2],
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transcribe.as.bytes stages audio, transcribes it, and removes the staged file', async () => {
  const s3Commands: unknown[] = [];
  const transcribeCommands: unknown[] = [];
  const wrapper = new DirectTranscribeWrapper(
    createTranscribeClient(async (command) => {
      transcribeCommands.push(command);

      if (command instanceof GetTranscriptionJobCommand) {
        return {
          TranscriptionJob: {
            TranscriptionJobStatus: 'COMPLETED',
            LanguageCode: 'en-US',
            Transcript: {
              TranscriptFileUri: 's3://out-bucket/results/job-bytes.json',
            },
          },
        };
      }

      return {};
    }),
    createS3Client(async (command) => {
      s3Commands.push(command);

      if (command instanceof GetObjectCommand) {
        return { Body: createBody(JSON.stringify(createTranscriptDocument())) };
      }

      return {};
    }),
    {
      stagingBucket: 'stage-bucket',
      stagingPrefix: 'incoming',
    },
  );

  await wrapper.as.bytes(Buffer.from('audio-binary'), {
    mediaFormat: 'wav',
    languageCode: 'en-US',
    jobName: 'job-bytes',
    outputBucket: 'out-bucket',
    outputPrefix: 'results',
  });

  const put = s3Commands.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
  const get = s3Commands.find((command) => command instanceof GetObjectCommand) as GetObjectCommand;
  const remove = s3Commands.find((command) => command instanceof DeleteObjectCommand) as DeleteObjectCommand;
  const start = transcribeCommands.find(
    (command) => command instanceof StartTranscriptionJobCommand,
  ) as StartTranscriptionJobCommand;

  assert.deepEqual(put.input, {
    Bucket: 'stage-bucket',
    Key: 'incoming/job-bytes.wav',
    Body: Buffer.from('audio-binary'),
    ContentType: 'audio/wav',
  });
  assert.deepEqual(start.input, {
    TranscriptionJobName: 'job-bytes',
    Media: {
      MediaFileUri: 's3://stage-bucket/incoming/job-bytes.wav',
    },
    MediaFormat: 'wav',
    LanguageCode: 'en-US',
    OutputBucketName: 'out-bucket',
    OutputKey: 'results/job-bytes.json',
  });
  assert.deepEqual(get.input, {
    Bucket: 'out-bucket',
    Key: 'results/job-bytes.json',
  });
  assert.deepEqual(remove.input, {
    Bucket: 'stage-bucket',
    Key: 'incoming/job-bytes.wav',
  });
});

test('transcribe.as.base64 accepts raw base64 and data URLs', async () => {
  const s3Commands: unknown[] = [];
  const wrapper = new DirectTranscribeWrapper(
    createTranscribeClient(async (command) => {
      if (command instanceof GetTranscriptionJobCommand) {
        return {
          TranscriptionJob: {
            TranscriptionJobStatus: 'COMPLETED',
            Transcript: {
              TranscriptFileUri: 's3://out-bucket/job-base64.json',
            },
          },
        };
      }

      return {};
    }),
    createS3Client(async (command) => {
      s3Commands.push(command);

      if (command instanceof GetObjectCommand) {
        return { Body: createBody(JSON.stringify(createTranscriptDocument())) };
      }

      return {};
    }),
    {
      stagingBucket: 'stage-bucket',
    },
  );

  await wrapper.as.base64(Buffer.from('alpha').toString('base64'), {
    mediaFormat: 'mp3',
    languageCode: 'en-US',
    jobName: 'job-alpha',
  });
  await wrapper.as.base64(`data:audio/wav;base64,${Buffer.from('beta').toString('base64')}`, {
    mediaFormat: 'wav',
    languageCode: 'en-US',
    jobName: 'job-beta',
  });

  const puts = s3Commands.filter((command) => command instanceof PutObjectCommand) as PutObjectCommand[];

  assert.equal(puts.length, 2);
  assert.deepEqual(puts[0].input, {
    Bucket: 'stage-bucket',
    Key: 'job-alpha.mp3',
    Body: Buffer.from('alpha'),
    ContentType: 'audio/mpeg',
  });
  assert.deepEqual(puts[1].input, {
    Bucket: 'stage-bucket',
    Key: 'job-beta.wav',
    Body: Buffer.from('beta'),
    ContentType: 'audio/wav',
  });
});

test('transcribe.as.uri refreshes the transcript URI when the temporary link expires', async () => {
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push(url);
    fetchCount += 1;

    if (fetchCount === 1) {
      return {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response;
    }

    return {
      ok: true,
      async json() {
        return createTranscriptDocument();
      },
    } as Response;
  }) as typeof fetch;

  let getCount = 0;

  try {
    const wrapper = new DirectTranscribeWrapper(
      createTranscribeClient(async (command) => {
        if (command instanceof GetTranscriptionJobCommand) {
          getCount += 1;
          return {
            TranscriptionJob: {
              TranscriptionJobStatus: 'COMPLETED',
              Transcript: {
                TranscriptFileUri:
                  getCount === 1
                    ? 'https://example.com/expired.json'
                    : 'https://example.com/refreshed.json',
              },
            },
          };
        }

        return {};
      }),
      createS3Client(),
    );

    const result = await wrapper.as.uri('https://example.com/audio.mp3', {
      mediaFormat: 'mp3',
      languageCode: 'en-US',
      jobName: 'job-refresh',
    });

    assert.equal(result.transcriptFileUri, 'https://example.com/refreshed.json');
    assert.deepEqual(fetchCalls, [
      'https://example.com/expired.json',
      'https://example.com/refreshed.json',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transcribe.as.uri surfaces AWS failure reasons', async () => {
  const wrapper = new DirectTranscribeWrapper(
    createTranscribeClient(async (command) => {
      if (command instanceof GetTranscriptionJobCommand) {
        return {
          TranscriptionJob: {
            TranscriptionJobStatus: 'FAILED',
            FailureReason: 'Unsupported media format.',
          },
        };
      }

      return {};
    }),
    createS3Client(),
  );

  await assert.rejects(
    wrapper.as.uri('s3://bucket/audio.mp3', {
      mediaFormat: 'mp3',
      languageCode: 'en-US',
      jobName: 'job-failed',
    }),
    /Unsupported media format\./,
  );
});

test('transcribe.as.bytes and transcribe.as.base64 require a staging bucket', async () => {
  const wrapper = new DirectTranscribeWrapper(createTranscribeClient(), createS3Client());

  await assert.rejects(
    wrapper.as.bytes(Buffer.from('audio'), {
      mediaFormat: 'mp3',
      languageCode: 'en-US',
      jobName: 'job-no-stage',
    }),
    /require a stagingBucket/,
  );

  await assert.rejects(
    wrapper.as.base64(Buffer.from('audio').toString('base64'), {
      mediaFormat: 'mp3',
      languageCode: 'en-US',
      jobName: 'job-no-stage-base64',
    }),
    /require a stagingBucket/,
  );
});
