import Dexie, { type Table } from 'dexie'

// ── Cached row shapes ────────────────────────────────────────────────────────

export interface CachedDayItem {
  id:          string
  userId:      string
  date:        string
  source:      string
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  startTime:   string | null
  endTime:     string | null
  isComplete:  boolean
  priority:    string
  colour:      string | null
  position:    number
  counterCurrent: number
  counterTarget:  number | null
  createdAt:   string
  updatedAt:   string
}

export interface CachedInboxItem {
  id:             string
  userId:         string
  content:        string
  state:          string
  promotedNodeId: string | null
  carriedOver:    boolean
  isCompleted:    boolean
  createdAt:      string
  updatedAt:      string
}

export interface CachedTreeNode {
  id:        string
  userId:    string
  title:     string
  type:      string
  status:    string
  parentId:  string | null
  position:  number
  updatedAt: string
}

export interface CachedWeekFocus {
  id:          string
  userId:      string
  weekStart:   string
  source:      string
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  isComplete:  boolean
  position:    number
}

export interface CachedMonthFocus {
  id:          string
  userId:      string
  monthStart:  string
  source:      string
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  isComplete:  boolean
  position:    number
}

export interface CachedJournalEntry {
  id:        string
  userId:    string
  date:      string
  content:   string
  createdAt: string
  updatedAt: string
}

// ── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncEntry {
  id?:       number          // auto-increment PK
  table:     string          // 'ns_inbox_items' | 'ns_day_items'
  op:        'insert' | 'update'
  payload:   Record<string, unknown>
  createdAt: number          // Date.now()
  userId:    string          // owner — replay only processes entries matching the current user
}

// ── Database ─────────────────────────────────────────────────────────────────

class NorthstarDB extends Dexie {
  dayItems!:    Table<CachedDayItem,    string>
  inboxItems!:  Table<CachedInboxItem,  string>
  treeNodes!:   Table<CachedTreeNode,   string>
  weekFocus!:   Table<CachedWeekFocus,  string>
  monthFocus!:  Table<CachedMonthFocus, string>
  journalEntries!: Table<CachedJournalEntry, string>
  syncQueue!:   Table<SyncEntry,        number>

  constructor() {
    super('northstar_v2')
    this.version(1).stores({
      dayItems:   'id, userId, date',
      inboxItems: 'id, userId, createdAt',
      treeNodes:  'id, userId',
      syncQueue:  '++id, table, createdAt',
    })
    this.version(2).stores({
      weekFocus:  'id, userId, weekStart',
      monthFocus: 'id, userId, monthStart',
    })
    this.version(3).stores({
      syncQueue: '++id, table, createdAt, userId',
    })
    this.version(4).stores({
      // Compound index used by the offline "today's items" lookup —
      // previously missing, which threw a SchemaError on every offline
      // read and silently fell back to a full-table scan.
      dayItems: 'id, userId, date, [userId+date]',
    })
    this.version(5).stores({
      journalEntries: 'id, userId, date, [userId+date]',
    })
    this.version(6).stores({
      // counterCurrent/counterTarget added to CachedDayItem — no new indexes,
      // just a schema version bump per project convention.
      dayItems: 'id, userId, date, [userId+date]',
    })
  }
}

export const db = new NorthstarDB()

/** Wipes every local cache table. Used on sign-out and on auth-user change. */
export async function clearAllCaches(): Promise<void> {
  try {
    await Promise.all([
      db.dayItems.clear(),
      db.inboxItems.clear(),
      db.treeNodes.clear(),
      db.weekFocus.clear(),
      db.monthFocus.clear(),
      db.journalEntries.clear(),
      db.syncQueue.clear(),
    ])
  } catch (e) {
    console.warn('[db] failed to clear local caches:', e)
  }
}
