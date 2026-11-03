import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DocumentRecord, TaskRecord } from '../types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;

const documentRow = (record: DocumentRecord) => ({
  id: record.id, owner_id: record.ownerId, source_type: record.sourceType, category: record.category,
  details: record.details, retention: record.retention, image_path: record.imagePath ?? null,
  status: record.status, archived_at: record.archivedAt ?? null, created_at: record.createdAt, updated_at: record.updatedAt,
});

const taskRow = (record: TaskRecord) => ({
  id: record.id, owner_id: record.ownerId, document_id: record.documentId, position: record.position,
  title: record.title, due_date: record.dueDate ?? null, completed: record.completed,
  recommendation_source: record.recommendationSource, reminder_days: record.reminderDays,
  created_at: record.createdAt, updated_at: record.updatedAt,
});

export async function syncDocument(record: DocumentRecord) {
  if (!supabase) return record;
  let next = record;
  if (record.retention === 'image_and_details' && record.sourceUri && !record.imagePath) {
    const path = `${record.ownerId}/${record.id}.jpg`;
    const file = new File(record.sourceUri);
    const { error: imageError } = await supabase.storage.from('vault-images').upload(path, await file.arrayBuffer(), { contentType: 'image/jpeg', upsert: true });
    if (imageError) throw imageError;
    next = { ...record, imagePath: path };
  }
  const { error } = await supabase.from('documents').upsert(documentRow(next), { onConflict: 'id' });
  if (error) throw error;
  return next;
}

export async function syncTask(record: TaskRecord) {
  if (!supabase) return;
  const { error } = await supabase.from('tasks').upsert(taskRow(record), { onConflict: 'id' });
  if (error) throw error;
}

export async function getVaultImageUrl(path: string) {
  if (!supabase) return undefined;
  const { data, error } = await supabase.storage.from('vault-images').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteRemoteTask(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteRemoteDocument(record: DocumentRecord) {
  if (!supabase) return;
  if (record.imagePath) {
    const { error: imageError } = await supabase.storage.from('vault-images').remove([record.imagePath]);
    if (imageError) throw imageError;
  }
  const { error } = await supabase.from('documents').delete().eq('id', record.id);
  if (error) throw error;
}

export async function fetchRemoteRecords(ownerId: string) {
  if (!supabase) return null;
  const [{ data: documents, error: documentError }, { data: tasks, error: taskError }] = await Promise.all([
    supabase.from('documents').select('*').eq('owner_id', ownerId),
    supabase.from('tasks').select('*').eq('owner_id', ownerId),
  ]);
  if (documentError) throw documentError;
  if (taskError) throw taskError;
  return {
    documents: (documents ?? []).map((row: any): DocumentRecord => ({
      id: row.id, ownerId: row.owner_id, sourceType: row.source_type, category: row.category, details: row.details,
      retention: row.retention, imagePath: row.image_path ?? undefined, status: row.status, syncState: 'synced',
      createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at ?? undefined,
    })),
    tasks: (tasks ?? []).map((row: any): TaskRecord => ({
      id: row.id, ownerId: row.owner_id, documentId: row.document_id, position: row.position, title: row.title,
      dueDate: row.due_date ?? undefined, completed: row.completed, recommendationSource: row.recommendation_source,
      reminderDays: row.reminder_days ?? [7, 3, 1], syncState: 'synced', createdAt: row.created_at, updatedAt: row.updated_at,
    })),
  };
}
