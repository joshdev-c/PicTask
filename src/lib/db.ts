import * as SQLite from 'expo-sqlite';
import type { DocumentRecord, OfflineMutation, TaskRecord } from '../types';

let database: SQLite.SQLiteDatabase | null = null;

async function db() {
  if (!database) {
    database = await SQLite.openDatabaseAsync('pictask.db');
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents_local (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks_local (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mutations_local (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL);
    `);
  }
  return database;
}

export async function loadLocalRecords(ownerId: string) {
  const connection = await db();
  const [documents, tasks] = await Promise.all([
    connection.getAllAsync<{ data: string }>('SELECT data FROM documents_local WHERE owner_id = ?', ownerId),
    connection.getAllAsync<{ data: string }>('SELECT data FROM tasks_local WHERE owner_id = ?', ownerId),
  ]);
  return { documents: documents.map((row) => JSON.parse(row.data) as DocumentRecord), tasks: tasks.map((row) => JSON.parse(row.data) as TaskRecord) };
}

export async function saveLocalDocument(record: DocumentRecord) {
  const connection = await db();
  await connection.runAsync('INSERT OR REPLACE INTO documents_local (id, owner_id, data) VALUES (?, ?, ?)', record.id, record.ownerId, JSON.stringify(record));
}

export async function saveLocalTask(record: TaskRecord) {
  const connection = await db();
  await connection.runAsync('INSERT OR REPLACE INTO tasks_local (id, owner_id, data) VALUES (?, ?, ?)', record.id, record.ownerId, JSON.stringify(record));
}

export async function removeLocalTask(id: string) {
  const connection = await db();
  await connection.runAsync('DELETE FROM tasks_local WHERE id = ?', id);
}

export async function removeLocalRecords(ownerId: string) {
  const connection = await db();
  await connection.runAsync('DELETE FROM documents_local WHERE owner_id = ?', ownerId);
  await connection.runAsync('DELETE FROM tasks_local WHERE owner_id = ?', ownerId);
  await connection.runAsync('DELETE FROM mutations_local WHERE owner_id = ?', ownerId);
}

export async function queueMutation(mutation: OfflineMutation) {
  const connection = await db();
  await connection.runAsync('INSERT OR REPLACE INTO mutations_local (id, owner_id, data) VALUES (?, ?, ?)', mutation.id, mutation.ownerId, JSON.stringify(mutation));
}

export async function removeMutation(id: string) {
  const connection = await db();
  await connection.runAsync('DELETE FROM mutations_local WHERE id = ?', id);
}

export async function loadMutations(ownerId: string) {
  const connection = await db();
  const rows = await connection.getAllAsync<{ data: string }>('SELECT data FROM mutations_local WHERE owner_id = ? ORDER BY rowid', ownerId);
  return rows.map((row) => JSON.parse(row.data) as OfflineMutation);
}
