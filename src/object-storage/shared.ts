import { Buffer } from 'buffer';
import type { Endpoint, EndpointV2, Provider } from '@smithy/types';
import type { Source } from '../types';

type RequestQueryValue = string | undefined | null | Array<string | undefined | null>;
type BooleanProvider = boolean | Provider<boolean | undefined> | undefined;
type EndpointInput =
  | string
  | Endpoint
  | EndpointV2
  | Provider<string>
  | Provider<Endpoint>
  | Provider<EndpointV2>
  | undefined;

export interface PresignedRequestLike {
  protocol: string;
  hostname: string;
  port?: number;
  path: string;
  query?: Record<string, RequestQueryValue>;
}

export const AsBase64 = Symbol('base64');
export const AsBytes = Symbol('bytes');

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export async function resolveBooleanConfig(value: BooleanProvider): Promise<boolean> {
  if (typeof value === 'function') {
    return Boolean(await value());
  }

  return Boolean(value);
}

export function encodeObjectStoragePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function resolveObjectStorageKey(prefix: string | undefined, key: string): string {
  const normalizedPrefix = (prefix ?? '').replace(/^\/+|\/+$/g, '');
  const normalizedKey = key.replace(/^\/+/g, '');

  if (!normalizedPrefix) {
    return normalizedKey;
  }

  return `${normalizedPrefix}/${normalizedKey}`;
}

export function formatPresignedRequest(request: PresignedRequestLike): string {
  const url = new URL(
    `${request.protocol}//${request.hostname}${request.port ? `:${request.port}` : ''}${request.path}`,
  );

  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, item);
        }
      }
      continue;
    }

    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  }

  return url.toString();
}

export async function resolveEndpointUrl(endpoint: EndpointInput): Promise<URL | undefined> {
  if (!endpoint) {
    return undefined;
  }

  const resolved = typeof endpoint === 'function' ? await endpoint() : endpoint;

  if (typeof resolved === 'string') {
    return new URL(resolved);
  }

  if ('url' in resolved && resolved.url instanceof URL) {
    return resolved.url;
  }

  if ('protocol' in resolved && 'hostname' in resolved) {
    const port = resolved.port ? `:${resolved.port}` : '';
    const path = resolved.path ?? '/';
    return new URL(`${resolved.protocol}//${resolved.hostname}${port}${path}`);
  }

  return undefined;
}

export function resolvePresignedExpirationSeconds(expiresInSeconds?: number): number {
  if (expiresInSeconds === undefined) {
    return 900;
  }

  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('expiresInSeconds must be a positive integer.');
  }

  if (expiresInSeconds > 604800) {
    throw new Error('expiresInSeconds cannot exceed 604800 seconds (7 days).');
  }

  return expiresInSeconds;
}

export async function sourceToBuffer(source: Source): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    return source;
  }
  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }
  if (source instanceof ArrayBuffer) {
    return Buffer.from(source);
  }
  if (source instanceof URL) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to fetch source: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (typeof source === 'string') {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Failed to fetch source: ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    }
    if (source.startsWith('data:')) {
      const base64Index = source.indexOf('base64,');
      if (base64Index !== -1) {
        return Buffer.from(source.substring(base64Index + 7), 'base64');
      }
      return Buffer.from(source.split(',')[1] || '');
    }
    if (
      !/\s/.test(source) &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source)
    ) {
      try {
        return Buffer.from(source, 'base64');
      } catch {
        // Fallback to plain string interpretation.
      }
    }
    return Buffer.from(source);
  }

  throw new Error('Unsupported source type');
}

export function resolveSourceContentType(source: Source): string {
  if (typeof source === 'string' && source.startsWith('data:')) {
    const match = source.match(/^data:(.*?);/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return DEFAULT_CONTENT_TYPE;
}
