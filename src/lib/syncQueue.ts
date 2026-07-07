import { db } from './db'
import { supabase } from './supabase'

/** Add an operation to the offline sync queue, scoped to the writing user. */
export async function enqueue(
  table:   string,
  op:      'insert' | 'update',
  payload: Record<string, unknown>,
  userId:  string,
) {
  await db.syncQueue.add({ table, op, payload, createdAt: Date.now(), userId })
}

/**
 * Replay queued operations against Supabase in order, for the given user
 * only. Entries queued under a different user (e.g. someone else signed in
 * on this device before their writes synced) are left untouched in the
 * queue rather than being replayed under the wrong account.
 */
export async function replayQueue(userId: string): Promise<void> {
  const entries = await db.syncQueue
    .where('userId').equals(userId)
    .sortBy('createdAt')
  if (entries.length === 0) return

  for (const entry of entries) {
    try {
      if (entry.op === 'insert') {
        const { error } = await supabase.from(entry.table).insert(entry.payload)
        if (error) {
          // Duplicate key = already synced from another device — treat as success
          if (error.code === '23505') {
            await db.syncQueue.delete(entry.id!)
            continue
          }
          console.warn('[sync] insert failed, keeping in queue:', error.message)
          continue
        }
      } else if (entry.op === 'update') {
        const { id, ...patch } = entry.payload
        const { error } = await supabase
          .from(entry.table)
          .update({ ...patch, user_id: userId })
          .eq('id', id)
          .eq('user_id', userId)
        if (error) {
          console.warn('[sync] update failed, keeping in queue:', error.message)
          continue
        }
      }
      await db.syncQueue.delete(entry.id!)
    } catch (e) {
      console.warn('[sync] unexpected error:', e)
    }
  }
}
