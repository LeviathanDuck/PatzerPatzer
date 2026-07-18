import type { DiagnosticReportScreenshotAttachment } from './reportAssembly';

export type PackageUploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed';

export interface PackageUploadState {
  filename: string;
  assetFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: PackageUploadStatus;
  progress: number | null;
  message: string;
}

export interface PackageUploadResult {
  packageId: string;
  expected: number;
  uploaded: number;
  failedFilenames: string[];
  verified: boolean;
}


export function packageUploadStatesFromAttachments(
  attachments: DiagnosticReportScreenshotAttachment[],
): PackageUploadState[] {
  return attachments.map(attachment => ({
    filename: attachment.fileName,
    assetFilename: attachment.assetFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    status: 'queued',
    progress: 0,
    message: 'Queued',
  }));
}

export function packageUploadSummary(uploaded: number, expected: number): string {
  if (expected <= 0) return '';
  return `${uploaded} of ${expected} screenshots uploaded`;
}

