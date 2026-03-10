import type { Endpoint, EndpointV2, Provider } from '@smithy/types';

type RequestQueryValue = string | undefined | null | Array<string | undefined | null>;

export interface PresignedRequestLike {
  protocol: string;
  hostname: string;
  port?: number;
  path: string;
  query?: Record<string, RequestQueryValue>;
}

type BooleanProvider = boolean | Provider<boolean | undefined> | undefined;
type EndpointInput =
  | string
  | Endpoint
  | EndpointV2
  | Provider<string>
  | Provider<Endpoint>
  | Provider<EndpointV2>
  | undefined;

export async function resolveBooleanConfig(value: BooleanProvider): Promise<boolean> {
  if (typeof value === 'function') {
    return Boolean(await value());
  }

  return Boolean(value);
}

export function encodeS3Path(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function resolveS3Key(prefix: string | undefined, key: string): string {
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
