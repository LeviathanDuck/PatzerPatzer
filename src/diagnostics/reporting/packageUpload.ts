import { Severity } from '../types';
import type { DiagnosticMetadata } from '../types';
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

export interface ReportPackageUploadInput {
  packageId: string;
  packageKind: string;
  issueId: string;
  reportId: string;
  capturedAt: string;
  route: string;
  attachments: DiagnosticReportScreenshotAttachment[];
  files: File[];
  manifestExtras?: Record<string, unknown>;
  setUploadStates: (states: PackageUploadState[]) => void;
  setUploadSummary: (summary: string) => void;
  updateUploadState: (assetFilename: string, patchState: Partial<PackageUploadState>) => void;
  rerender: () => void;
  recordEvent: (message: string, severity?: Severity, extraMetadata?: DiagnosticMetadata) => void;
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


export async function uploadReportScreenshotPackage(
  input: ReportPackageUploadInput,
): Promise<PackageUploadResult> {
  throw new Error('Remote screenshot upload is unavailable in the public source build.');
}
