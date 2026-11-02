export type AppTab = 'home' | 'calendar' | 'scan' | 'vault' | 'profile';
export type DocumentCategory = 'bill' | 'deadline' | 'general';
export type DocumentStatus = 'active' | 'archived';
export type RetentionChoice = 'details_only' | 'image_and_details' | 'discard_after_task';
export type SyncState = 'synced' | 'pending' | 'failed' | 'local';

export interface DocumentDetails {
  provider: string;
  title: string;
  amountDue?: number;
  dueDate?: string;
  billingPeriod?: string;
  accountNumber?: string;
  retainFullIdentifier: boolean;
  rawText?: string;
}

export interface DocumentRecord {
  id: string;
  ownerId: string;
  sourceType: 'scan' | 'photo' | 'manual';
  category: DocumentCategory;
  details: DocumentDetails;
  retention: RetentionChoice;
  sourceUri?: string;
  imagePath?: string;
  status: DocumentStatus;
  syncState: SyncState;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface TaskRecord {
  id: string;
  ownerId: string;
  documentId: string;
  position: number;
  title: string;
  dueDate?: string;
  completed: boolean;
  recommendationSource: 'bill_rule' | 'deadline_rule' | 'general_rule' | 'manual';
  reminderDays: number[];
  syncState: SyncState;
  createdAt: string;
  updatedAt: string;
}

export interface ScanReviewInput {
  sourceUri?: string;
  sourceType: DocumentRecord['sourceType'];
  category: DocumentCategory;
  details: DocumentDetails;
  confidence: 'high' | 'low' | 'manual';
  retention: RetentionChoice;
}

export interface OfflineMutation {
  id: string;
  ownerId: string;
  entity: 'document' | 'task';
  operation: 'upsert' | 'delete';
  payload: string;
  localTimestamp: string;
  retryCount: number;
}

export interface AppUser {
  id: string;
  email: string;
  preview: boolean;
}
