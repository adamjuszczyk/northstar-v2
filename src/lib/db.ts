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
  startTime:   string | null
  endTime:     string | null
  isComplete:  boolean
  priority:    string
  position:    number
  createdAt:   string
  updatedAt:   string
}

export interface CachedInboxItem {
  id:             string
  userId:         string
  content:        string
  state:          string
  promotedNodeId: string | null
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

// ── Sync queue ───────────────────────────────────────────────────────────────

export interface SyncEntry {
  id?:       number          // auto-increment PK
  table:     string          // 'ns_inbox_items' | 'ns_day_items'
  op:        'insert' | 'update'
  payload:   Record<string, unknown>
  createdAt: number          // Date.now()
}

// ── Database ─────────────────────────────────────────────────────────────────

class NorthstarDB extends Dexie {
  dayItems!:   Table<CachedDayItem,   string>
  inboxItems!: Table<CachedInboxItem, string>
  treeNodes!:  Table<CachedTreeNode,  string>
  syncQueue!:  Table<SyncEntry,       number>

  constructor() {
    super('northstar_v2')
    this.version(1).stores({
      dayItems:   'id, userId, date',
      inboxItems: 'id, userId, createdAt',
      treeNodes:  'id, userId',
      syncQueue:  '++id, table, createdAt',
    })
  }
}

export const db = new NorthstarDB()
