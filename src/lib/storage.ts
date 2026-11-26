import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../config';

export interface Storage {
  /** URL PUT présignée pour envoyer un fichier directement au bucket. */
  presignUpload(input: { key: string; contentType: string; contentLength: number }): Promise<string>;
  publicBaseUrl: string;
}

/** Adaptateur S3 compatible : Cloudflare R2, AWS S3, Scaleway, OVH… */
export function createS3Storage(cfg: StorageConfig): Storage {
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // Sans ça, le SDK ajoute une somme de contrôle CRC32 à l'URL présignée,
    // que le navigateur ne peut pas fournir → R2 refuse l'upload.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return {
    publicBaseUrl: cfg.publicUrl,
    presignUpload({ key, contentType, contentLength }) {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
        { expiresIn: 300 },
      );
    },
  };
}
