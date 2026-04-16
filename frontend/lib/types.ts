export interface Tab {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  isActive: boolean;
  icon: string | null;
  ocrPromptTemplate: string | null;
  workflowPromptTemplate: string | null;
  sharepointSiteId: string | null;
  sharepointDriveId: string | null;
  sharepointFolderPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NamingRule {
  id: string;
  tabId: string;
  documentType: string;
  pattern: string;
  description: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadFileResult {
  originalFileName: string;
  documentType?: string;
  outputFileName?: string;
  confidence?: number;
  reason?: string;
}

export interface DestinationCandidate {
  absolutePath: string;
  exists: boolean;
  reason: string;
}

export interface DestinationResolution {
  customerName: string;
  customerKana?: string;
  customerFolderPath?: string;
  customerFolderExists: boolean;
  businessTabFound: boolean;
  destinationCandidates: DestinationCandidate[];
  newFolderPlan: string[];
  warnings: string[];
}

export interface UploadStructuredResult {
  customerName?: string;
  customerKana?: string;
  customerNameCandidates?: string[];
  customerKanaCandidates?: string[];
  contractNumber?: string;
  applicationNumber?: string;
  sharepointFolderPath?: string;
  confidence?: number;
  summary?: string;
  destinationResolution?: DestinationResolution;
  fileResults?: UploadFileResult[];
}

export interface UploadFileRecord {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
}

export interface UploadRecord {
  id: string;
  tabId: string;
  userId: string;
  folderName: string;
  contractNumber: string | null;
  customerName: string | null;
  applicationNumber: string | null;
  status:
    | 'PENDING'
    | 'OCR_PROCESSING'
    | 'OCR_DONE'
    | 'CONFIRMED'
    | 'UPLOADING_SHAREPOINT'
    | 'COMPLETED'
    | 'ERROR';
  sharepointDestinationPath: string | null;
  sharepointItemId: string | null;
  sharepointWebUrl: string | null;
  ocrRawResponse: Record<string, unknown> | null;
  ocrStructuredResult: UploadStructuredResult | null;
  ocrConfidence: number | null;
  needsReview: boolean;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: UploadFileRecord[];
}
