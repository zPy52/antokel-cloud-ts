export interface ObjectStoragePresignedUploadOptions {
  /**
   * How long the presigned URL remains valid, in seconds.
   * Defaults to 900 seconds (15 minutes). Maximum 604800 seconds (7 days).
   */
  expiresInSeconds?: number;
  /**
   * Optional content type that the client must send with the upload request.
   */
  contentType?: string;
}

export interface ObjectStoragePresignedDownloadOptions {
  /**
   * How long the presigned URL remains valid, in seconds.
   * Defaults to 900 seconds (15 minutes). Maximum 604800 seconds (7 days).
   */
  expiresInSeconds?: number;
}

export interface ObjectStoragePresignedUploadResult {
  url: string;
  method: 'PUT';
  bucket: string;
  pathToFile: string;
  headers: Record<string, string>;
}
