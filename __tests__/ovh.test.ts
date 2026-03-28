import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { AntokelOVH } from '../src';
import { OvhObjectStorageWrapper } from '../src/ovh';
import { SubmoduleOvhObjectStoragePresigned } from '../src/ovh/object-storage/presigned';

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

test('AntokelOVH configures an S3-compatible client for the OVH io endpoint', () => {
  const ovh = new AntokelOVH({
    region: 'GRA',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  });

  const config = (ovh as any).createOvhClientConfig();

  assert.equal(config.region, 'gra');
  assert.equal(config.endpoint, 'https://s3.gra.io.cloud.ovh.net');
  assert.equal(config.forcePathStyle, true);
  assert.deepEqual(config.credentials, {
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  });
});

test('AntokelOVH.ObjectStorage returns a wrapper and reuses its client', () => {
  const ovh = new AntokelOVH({ region: 'gra' });

  const first = ovh.ObjectStorage('bucket');
  const firstClient = (ovh as any)._s3Client;
  const second = ovh.ObjectStorage('bucket');

  assert.ok(first instanceof OvhObjectStorageWrapper);
  assert.ok(second instanceof OvhObjectStorageWrapper);
  assert.ok(firstClient);
  assert.equal((ovh as any)._s3Client, firstClient);
});

test('OvhObjectStorageWrapper upload and download use normalized key paths', async () => {
  const sent: unknown[] = [];
  const storage = new OvhObjectStorageWrapper(
    createClient(async (command) => {
      sent.push(command);
      if (command instanceof GetObjectCommand) {
        return { Body: createBody('hello'), ContentType: 'text/plain' };
      }
      return {};
    }),
    'bucket',
    'gra',
    'folder/',
  );

  await storage.upload('hello', 'file.txt');
  const downloaded = await storage.download('file.txt', storage.as.bytes);
  const base64 = await storage.download('file.txt', storage.as.base64);

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

test('OvhObjectStorageWrapper.move copies then deletes using normalized keys', async () => {
  const sent: unknown[] = [];
  const storage = new OvhObjectStorageWrapper(
    createClient(async (command) => {
      sent.push(command);
      return {};
    }),
    'bucket',
    'gra',
    'folder',
  );

  await storage.move('/old.txt', '/new.txt');

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

test('OvhObjectStorageWrapper maps OVH storage classes to S3 wire values', async () => {
  const sent: unknown[] = [];

  const oneAz = new OvhObjectStorageWrapper(
    createClient(async (command) => {
      sent.push(command);
      return {};
    }),
    'bucket',
    'gra',
    'folder/',
  );
  const threeAz = new OvhObjectStorageWrapper(
    createClient(async (command) => {
      sent.push(command);
      return {};
    }),
    'bucket',
    'eu-west-par',
    'folder/',
  );

  await oneAz.upload('fast', 'fast.txt', { storageClass: 'high_performance' });
  await threeAz.upload('archive', 'archive.txt', { storageClass: 'active_archive' });
  await threeAz.upload('cold', 'cold.txt', { storageClass: 'cold_archive' });

  const puts = sent.filter((command) => command instanceof PutObjectCommand) as PutObjectCommand[];

  assert.equal(puts.length, 3);
  assert.equal(puts[0].input.StorageClass, 'EXPRESS_ONEZONE');
  assert.equal(puts[1].input.StorageClass, 'GLACIER_IR');
  assert.equal(puts[2].input.StorageClass, 'DEEP_ARCHIVE');
});

test('OvhObjectStorageWrapper rejects unsupported region and storage-class combinations', async () => {
  const paris = new OvhObjectStorageWrapper(createClient(), 'bucket', 'eu-west-par');
  const gravelines = new OvhObjectStorageWrapper(createClient(), 'bucket', 'gra');
  const milan = new OvhObjectStorageWrapper(createClient(), 'bucket', 'eu-south-mil');

  await assert.rejects(
    paris.upload('data', 'file.txt', { storageClass: 'high_performance' }),
    /high_performance/,
  );
  await assert.rejects(
    gravelines.upload('data', 'file.txt', { storageClass: 'active_archive' }),
    /active_archive/,
  );
  await assert.rejects(
    milan.upload('data', 'file.txt', { storageClass: 'cold_archive' }),
    /cold_archive/,
  );
});

test('SubmoduleOvhObjectStoragePresigned uses path-style OVH io endpoint URLs', async () => {
  const presigned = new SubmoduleOvhObjectStoragePresigned(
    new S3Client({
      region: 'gra',
      endpoint: 'https://s3.gra.io.cloud.ovh.net',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    }),
    'bucket',
    'folder/',
  ) as any;

  const captured: Array<{ headers: Record<string, string | undefined>; hostname: string; port?: number }> =
    [];

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

  assert.equal(
    download,
    'https://s3.gra.io.cloud.ovh.net/bucket/folder/asset.webp?X-Amz-SignedHeaders=host',
  );
  assert.equal(
    upload.url,
    'https://s3.gra.io.cloud.ovh.net/bucket/folder/asset.webp?X-Amz-SignedHeaders=host',
  );
  assert.deepEqual(captured, [
    {
      headers: { host: 's3.gra.io.cloud.ovh.net' },
      hostname: 's3.gra.io.cloud.ovh.net',
      port: undefined,
    },
    {
      headers: {
        host: 's3.gra.io.cloud.ovh.net',
        'content-type': 'image/webp',
      },
      hostname: 's3.gra.io.cloud.ovh.net',
      port: undefined,
    },
  ]);
});
