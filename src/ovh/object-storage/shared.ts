import { StorageClass } from '@aws-sdk/client-s3';
import { OvhObjectStorageClass } from './types';

const ONE_AZ_REGIONS = new Set([
  'gra',
  'rbx',
  'sbg',
  'de',
  'uk',
  'waw',
  'bhs',
  'ca-east-tor',
  'sgp',
  'ap-southeast-syd',
  'ap-south-mum',
]);

const ACTIVE_ARCHIVE_REGIONS = new Set(['eu-west-par', 'eu-south-mil']);
const COLD_ARCHIVE_REGIONS = new Set(['eu-west-par']);

export function normalizeOvhRegion(region: string): string {
  const normalizedRegion = region.trim().toLowerCase();
  if (!normalizedRegion) {
    throw new Error('OVH region is required.');
  }

  return normalizedRegion;
}

export function resolveOvhEndpoint(region: string, endpoint?: string): string {
  if (endpoint) {
    return endpoint;
  }

  return `https://s3.${normalizeOvhRegion(region)}.io.cloud.ovh.net`;
}

export function resolveOvhStorageClass(
  region: string,
  storageClass?: OvhObjectStorageClass,
): StorageClass | undefined {
  if (!storageClass) {
    return undefined;
  }

  const normalizedRegion = normalizeOvhRegion(region);

  switch (storageClass) {
    case 'high_performance':
      if (!ONE_AZ_REGIONS.has(normalizedRegion)) {
        throw new Error(
          `OVH storage class "high_performance" is only available in 1-AZ regions; received "${normalizedRegion}".`,
        );
      }
      return StorageClass.EXPRESS_ONEZONE;
    case 'standard':
      return StorageClass.STANDARD;
    case 'infrequent_access':
      return StorageClass.STANDARD_IA;
    case 'active_archive':
      if (!ACTIVE_ARCHIVE_REGIONS.has(normalizedRegion)) {
        throw new Error(
          `OVH storage class "active_archive" is only available in eu-west-par and eu-south-mil; received "${normalizedRegion}".`,
        );
      }
      return StorageClass.GLACIER_IR;
    case 'cold_archive':
      if (!COLD_ARCHIVE_REGIONS.has(normalizedRegion)) {
        throw new Error(
          `OVH storage class "cold_archive" is only available in eu-west-par; received "${normalizedRegion}".`,
        );
      }
      return StorageClass.DEEP_ARCHIVE;
    default: {
      const exhaustive: never = storageClass;
      return exhaustive;
    }
  }
}
