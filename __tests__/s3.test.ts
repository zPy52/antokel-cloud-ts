import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { S3Wrapper } from '../src/aws/s3';
import { SubmoduleS3AsText } from '../src/aws/s3/as-text';
import { SubmoduleS3Presigned } from '../src/aws/s3/presigned';
import { resolveS3Key } from '../src/aws/s3/shared';

function createBody(text: string) {
  const bytes = Buffer.from(text);
  return Object.assign(Readable.from([text]), {
    async transformToString() {
      return text;
    },
    async transformToByteArray() {
      return Uint8Array.from(bytes);
    },
  });
}

function createClient(sendImpl?: (command: unknown) => Promise<unknown>) {
  return {
    send: sendImpl ?? (async () => ({})),
    config: {},
  } as any;
}

test('resolveS3Key normalizes prefix separators', () => {
  assert.equal(resolveS3Key(undefined, 'file.txt'), 'file.txt');
  assert.equal(resolveS3Key('', 'file.txt'), 'file.txt');
  assert.equal(resolveS3Key('folder', 'file.txt'), 'folder/file.txt');
  assert.equal(resolveS3Key('folder/', 'file.txt'), 'folder/file.txt');
  assert.equal(resolveS3Key('/folder/', '/nested/file.txt'), 'folder/nested/file.txt');
});

test('S3Wrapper.remove deletes the normalized key', async () => {
  const sent: unknown[] = [];
  const s3 = new S3Wrapper(
    createClient(async (command) => {
      sent.push(command);
      return {};
    }),
    'bucket',
    'folder/',
  );

  await s3.remove('file.txt');

  assert.equal(sent.length, 1);
  assert.ok(sent[0] instanceof DeleteObjectCommand);
  assert.deepEqual((sent[0] as DeleteObjectCommand).input, {
    Bucket: 'bucket',
    Key: 'folder/file.txt',
  });
});

test('S3Wrapper.move copies then deletes using normalized keys', async () => {
  const sent: unknown[] = [];
  const s3 = new S3Wrapper(
    createClient(async (command) => {
      sent.push(command);
      return {};
    }),
    'bucket',
    'folder',
  );

  await s3.move('/old.txt', '/new.txt');

  assert.equal(sent.length, 2);
  assert.ok(sent[0] instanceof CopyObjectCommand);
  assert.ok(sent[1] instanceof DeleteObjectCommand);
  assert.deepEqual((sent[0] as CopyObjectCommand).input, {
    Bucket: 'bucket',
    Key: 'folder/new.txt',
    CopySource: 'bucket/folder/old.txt',
  });
  assert.deepEqual((sent[1] as DeleteObjectCommand).input, {
    Bucket: 'bucket',
    Key: 'folder/old.txt',
  });
});

test('S3Wrapper upload and download use the same normalized key format', async () => {
  const sent: unknown[] = [];
  const s3 = new S3Wrapper(
    createClient(async (command) => {
      sent.push(command);
      if (command instanceof GetObjectCommand) {
        return { Body: createBody('hello'), ContentType: 'text/plain' };
      }
      return {};
    }),
    'bucket',
    'folder/',
  );

  await s3.upload('hello', 'file.txt');
  const downloaded = await s3.download('file.txt', s3.as.bytes);
  const base64 = await s3.download('file.txt', s3.as.base64);

  assert.ok(Buffer.isBuffer(downloaded));
  assert.equal(downloaded.toString(), 'hello');
  assert.equal(base64, 'data:text/plain;base64,aGVsbG8=');

  const put = sent.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;
  const gets = sent.filter((command) => command instanceof GetObjectCommand) as GetObjectCommand[];

  assert.deepEqual(put.input, {
    Bucket: 'bucket',
    Key: 'folder/file.txt',
    Body: Buffer.from('hello'),
    ContentType: 'application/octet-stream',
  });
  assert.equal(gets.length, 2);
  assert.deepEqual(gets[0].input, { Bucket: 'bucket', Key: 'folder/file.txt' });
  assert.deepEqual(gets[1].input, { Bucket: 'bucket', Key: 'folder/file.txt' });
});

test('S3Wrapper.upload maps lowercase storageClass values to AWS storage classes', async () => {
  const sent: unknown[] = [];
  const s3 = new S3Wrapper(
    createClient(async (command) => {
      sent.push(command);
      return {};
    }),
    'bucket',
    'folder/',
  );

  await s3.upload('archive', 'archive.txt', { storageClass: 'glacier' });
  await s3.upload('tiered', 'tiered.txt', { storageClass: 'intelligent_tiering' });

  const puts = sent.filter((command) => command instanceof PutObjectCommand) as PutObjectCommand[];

  assert.equal(puts.length, 2);
  assert.deepEqual(puts[0].input, {
    Bucket: 'bucket',
    Key: 'folder/archive.txt',
    Body: Buffer.from('archive'),
    ContentType: 'application/octet-stream',
    StorageClass: 'GLACIER',
  });
  assert.deepEqual(puts[1].input, {
    Bucket: 'bucket',
    Key: 'folder/tiered.txt',
    Body: Buffer.from('tiered'),
    ContentType: 'application/octet-stream',
    StorageClass: 'INTELLIGENT_TIERING',
  });
});

test('SubmoduleS3AsText normalizes prefixed keys for read, write, and streamLines', async () => {
  const sent: unknown[] = [];
  const asText = new SubmoduleS3AsText(
    createClient(async (command) => {
      sent.push(command);
      if (command instanceof GetObjectCommand) {
        return { Body: createBody('a\nb\n') };
      }
      return {};
    }),
    'bucket',
    'folder/',
  );

  const content = await asText.read('/notes.txt');
  await asText.write('hello', '/notes.txt');
  const streamed = [];
  for await (const line of asText.streamLines('/notes.txt')) {
    streamed.push(line);
  }

  const gets = sent.filter((command) => command instanceof GetObjectCommand) as GetObjectCommand[];
  const put = sent.find((command) => command instanceof PutObjectCommand) as PutObjectCommand;

  assert.equal(content, 'a\nb\n');
  assert.deepEqual(streamed, ['a', 'b']);
  assert.deepEqual(gets[0].input, { Bucket: 'bucket', Key: 'folder/notes.txt' });
  assert.deepEqual(gets[1].input, { Bucket: 'bucket', Key: 'folder/notes.txt' });
  assert.deepEqual(put.input, {
    Bucket: 'bucket',
    Key: 'folder/notes.txt',
    Body: 'hello',
  });
});

test('SubmoduleS3Presigned normalizes keys before signing', async () => {
  const presigned = new SubmoduleS3Presigned(createClient(), 'bucket', 'folder/');
  const calls: Array<{ method: string; fullPath: string; expiresInSeconds?: number; contentType?: string }> = [];

  (presigned as any).signRequest = async (input: {
    method: 'GET' | 'PUT';
    fullPath: string;
    expiresInSeconds?: number;
    contentType?: string;
  }) => {
    calls.push(input);
    return {
      protocol: 'https:',
      hostname: 'example.com',
      path: '/signed',
      query: {},
    };
  };

  const upload = await presigned.upload('/asset.webp', {
    contentType: 'image/webp',
    expiresInSeconds: 60,
  });
  const download = await presigned.download('/asset.webp', { expiresInSeconds: 120 });

  assert.equal(upload.pathToFile, 'folder/asset.webp');
  assert.equal(download, 'https://example.com/signed');
  assert.deepEqual(calls, [
    {
      method: 'PUT',
      fullPath: 'folder/asset.webp',
      expiresInSeconds: 60,
      contentType: 'image/webp',
    },
    {
      method: 'GET',
      fullPath: 'folder/asset.webp',
      expiresInSeconds: 120,
    },
  ]);
});

test('SubmoduleS3Presigned defaults to a 15 minute expiration when none is provided', async () => {
  const presigned = new SubmoduleS3Presigned(createClient(), 'bucket', 'folder/') as any;
  let capturedExpiresIn: number | undefined;

  presigned.s3Client.config.credentials = async () => ({
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  });
  presigned.resolveRegion = async () => 'us-east-1';
  presigned.resolveEndpoint = async () => new URL('https://example.com/base/');
  presigned.createSigner = () => ({
    presign: async (_request: unknown, options: { expiresIn: number }) => {
      capturedExpiresIn = options.expiresIn;
      return {
        protocol: 'https:',
        hostname: 'example.com',
        path: '/signed',
        query: {},
      };
    },
  });

  await presigned.download('asset.webp');

  assert.equal(capturedExpiresIn, 900);
});

test('SubmoduleS3Presigned validates expiration bounds before signing', async () => {
  const presigned = new SubmoduleS3Presigned(createClient(), 'bucket', 'folder/');

  await assert.rejects(
    presigned.download('asset.webp', { expiresInSeconds: 0 }),
    /expiresInSeconds must be a positive integer\./,
  );
  await assert.rejects(
    presigned.upload('asset.webp', { expiresInSeconds: 604801 }),
    /expiresInSeconds cannot exceed 604800 seconds \(7 days\)\./,
  );
});

test('SubmoduleS3Presigned signs requests with the host header', async () => {
  const presigned = new SubmoduleS3Presigned(
    createClient(),
    'bucket',
    'folder/',
  ) as any;
  const captured: Array<{ headers: Record<string, string | undefined>; hostname: string; port?: number }> =
    [];

  presigned.s3Client.config.credentials = async () => ({
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  });
  presigned.resolveRegion = async () => 'us-east-1';
  presigned.resolveEndpoint = async () => new URL('https://example.com:8443/base/');
  presigned.createSigner = () => ({
    presign: async (request: {
      protocol: string;
      hostname: string;
      port?: number;
      path: string;
      headers: Record<string, string | undefined>;
    }) => {
      captured.push({
        headers: request.headers,
        hostname: request.hostname,
        port: request.port,
      });
      return {
        protocol: request.protocol,
        hostname: request.hostname,
        port: request.port,
        path: request.path,
        query: {
          'X-Amz-SignedHeaders': request.headers.host ? 'host' : '',
        },
      };
    },
  });

  const download = await presigned.download('asset.webp');
  const upload = await presigned.upload('asset.webp', {
    contentType: 'image/webp',
  });

  assert.equal(download, 'https://example.com:8443/base/folder/asset.webp?X-Amz-SignedHeaders=host');
  assert.equal(upload.url, 'https://example.com:8443/base/folder/asset.webp?X-Amz-SignedHeaders=host');
  assert.deepEqual(captured, [
    {
      headers: { host: 'example.com:8443' },
      hostname: 'example.com',
      port: 8443,
    },
    {
      headers: {
        host: 'example.com:8443',
        'content-type': 'image/webp',
      },
      hostname: 'example.com',
      port: 8443,
    },
  ]);
});
