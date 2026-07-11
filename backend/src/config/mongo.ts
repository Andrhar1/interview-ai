import { MongoClient } from 'mongodb';
import type { Collection, Db } from 'mongodb';
import { env } from './env.js';

/** A single exchange (turn) within an interview transcript. */
export interface TranscriptExchange {
  role: 'ai' | 'user';
  text: string;
  timestamp?: string;
}

/** Transcript document stored in the `transcripts` collection (PRD §5). */
export interface TranscriptDoc {
  session_id: string; // joins Postgres interview_sessions.id
  user_id: string;
  exchanges: TranscriptExchange[];
  summary?: string;
  created_at: Date;
}

let client: MongoClient | undefined;
let db: Db | undefined;

/**
 * Connects the shared MongoClient and verifies the connection with a ping.
 * Idempotent: calling it again while already connected is a no-op.
 */
export async function connectMongo(): Promise<void> {
  if (client) return;

  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set — cannot connect to MongoDB.');
  }

  const newClient = new MongoClient(env.MONGODB_URI);
  await newClient.connect();
  const newDb = newClient.db();
  await newDb.command({ ping: 1 });

  client = newClient;
  db = newDb;
  console.log('✓ MongoDB connected');
}

/** Returns the connected database handle. Throws if `connectMongo()` hasn't run yet. */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB is not connected — call connectMongo() before getDb().');
  }
  return db;
}

/** The `transcripts` collection (created lazily by MongoDB on first write). */
export function transcripts(): Collection<TranscriptDoc> {
  return getDb().collection<TranscriptDoc>('transcripts');
}

/** Closes the shared MongoClient (graceful shutdown / tests). */
export async function closeMongo(): Promise<void> {
  if (!client) return;
  await client.close();
  client = undefined;
  db = undefined;
}
