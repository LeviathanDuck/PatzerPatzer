import type { ReportSeverity } from './reportForm';

export type ReportIssueDraftStatus = 'active' | 'submitted' | 'discarded';

export interface ReportIssueDraftFormState {
  description: string;
  whatHappened: string;
  severity: ReportSeverity;
  expectedBehavior: string;
  actualBehavior: string;
}

export interface ReportIssueDraftContext {
  route: string;
  triggeredBy: string;
  extraTags: string[];
}

export interface ReportIssueDraftScreenshot {
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  assetFilename: string;
  lastModified?: number;
  blob: Blob;
}

export interface ReportIssueDraft {
  draftId: string;
  issueId: string;
  createdAt: number;
  updatedAt: number;
  status: ReportIssueDraftStatus;
  routeAtTrigger: string;
  context: ReportIssueDraftContext;
  form: ReportIssueDraftFormState;
  screenshots: ReportIssueDraftScreenshot[];
}
