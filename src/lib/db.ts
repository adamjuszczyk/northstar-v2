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
  originWeekFocusId:  string | null
  originMonthFocusId: string | null
  blockId:     string | null
  taskId:      string | null
  createdAt:   string
  updatedAt:   string
}

export interface CachedLine {
  id:        string
  userId:    string
  date:      string
  label:     string
  time:      string
  colour:    string | null
  position:  number
  createdAt: string
  updatedAt: string
}

export interface CachedBlock {
  id:        string
  userId:    string
  date:      string
  name:      string
  startTime: string
  endTime:   string
  colour:    string | null
  notes:     string | null
  position:  number
  createdAt: string
  updatedAt: string
}

export interface CachedInboxItem {
  id:             string
  userId:         string
  content:        string
  kind:           string
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
  sheetId:   string | null
  updatedAt: string
}

export interface CachedSheet {
  id:           string
  userId:       string
  name:         string
  anchorNodeId: string | null
  position:     number
  createdAt:    string
  updatedAt:    string
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
  taskId:      string | null
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
  taskId:      string | null
  isComplete:  boolean
  position:    number
}

export interface CachedTask {
  id:          string
  userId:      string
  source:      string
  title:       string | null
  treeNodeId:  string | null
  inboxItemId: string | null
  habitId:     string | null
  notes:       string | null
  isComplete:  boolean
  createdAt:   string
  updatedAt:   string
}

export interface CachedTaskStep {
  id:        string
  userId:    string
  taskId:    string
  content:   string
  position:  number
  isDone:    boolean
  doneAt:    string | null
  createdAt: string
  updatedAt: string
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
  lines!:       Table<CachedLine,       string>
  blocks!:      Table<CachedBlock,      string>
  tasks!:       Table<CachedTask,       string>
  taskSteps!:   Table<CachedTaskStep,   string>
  sheets!:      Table<CachedSheet,      string>
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
    this.version(7).stores({
      // originWeekFocusId/originMonthFocusId added to CachedDayItem — no new
      // indexes, just a schema version bump per project convention.
      dayItems: 'id, userId, date, [userId+date]',
    })
    this.version(8).stores({
      // kind added to CachedInboxItem (Notes vs Tasks split) — no new index,
      // just a schema version bump per project convention.
      inboxItems: 'id, userId, createdAt',
    })
    this.version(9).stores({
      lines:  'id, userId, date, [userId+date]',
      blocks: 'id, userId, date, [userId+date]',
      // blockId added to CachedDayItem — no new index, just a schema version
      // bump per project convention.
      dayItems: 'id, userId, date, [userId+date]',
    })
    this.version(10).stores({
      // CachedBlock.type/title replaced with a single required `name`
      // (Blocks are freely named, not typed — SPEC §5.2 correction). No new
      // index, just a schema version bump per project convention.
      blocks: 'id, userId, date, [userId+date]',
    })
    this.version(11).stores({
      // Task Lists & Split (v3 Phase 4) — new tasks/taskSteps stores.
      // CachedDayItem.taskId added; CachedWeekFocus.taskId/CachedMonthFocus
      // .taskId added too (this session's TaskSourceForm copy-not-link fix,
      // beyond TASKS.md's original Phase 4 scope). No new indexes on the
      // existing stores, just a schema version bump per project convention.
      tasks:     'id, userId',
      taskSteps: 'id, taskId, userId',
      dayItems:   'id, userId, date, [userId+date]',
      weekFocus:  'id, userId, weekStart',
      monthFocus: 'id, userId, monthStart',
    })
    this.version(12).stores({
      // Sheets (v3 Phase 7) — new sheets store. CachedTreeNode.sheetId
      // added — no new index, just a schema version bump per project
      // convention (sheet scoping is a render-layer filter, not a query).
      sheets:    'id, userId',
      treeNodes: 'id, userId',
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
      db.lines.clear(),
      db.blocks.clear(),
      db.tasks.clear(),
      db.taskSteps.clear(),
      db.sheets.clear(),
      db.syncQueue.clear(),
    ])
  } catch (e) {
    console.warn('[db] failed to clear local caches:', e)
  }
}
