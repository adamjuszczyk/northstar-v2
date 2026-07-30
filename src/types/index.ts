// ─── Tree ─────────────────────────────────────────────────────────────────────

export type NodeType   = 'vision' | 'goal' | 'project' | 'task'
export type NodeStatus = 'not_started' | 'in_progress' | 'complete'

export interface TreeNode {
  id:        string
  userId:    string
  parentId:  string | null  // null = root; adjacency list — the only structural field
  type:      NodeType       // visual label only; any type can nest under any other
  title:     string
  notes:     string | null
  status:    NodeStatus
  position:  number         // ordering among siblings sharing the same parentId
  sheetId:   string | null  // null = lives in the main tree; else the Sheet it lives in
  createdAt: string
  updatedAt: string
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

export interface Sheet {
  id:           string
  userId:       string
  name:         string
  anchorNodeId: string | null   // null = detached (not yet attached to a node)
  position:     number          // tab order
  createdAt:    string
  updatedAt:    string
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export type InboxState = 'unassigned' | 'scheduled' | 'promoted'
export type InboxKind  = 'task' | 'note'

export interface InboxItem {
  id:              string
  userId:          string
  content:         string         // single free-text field — no required structure
  kind:            InboxKind      // 'task' schedules/promotes; 'note' is inert capture
  state:           InboxState     // unused when kind = 'note'
  promotedNodeId:  string | null  // set when state = 'promoted'; unused when kind = 'note'
  carriedOver:     boolean        // true if auto-moved here from an unfinished standalone day item
  isCompleted:     boolean        // marked done directly from inbox; unused when kind = 'note'
  createdAt:       string
  updatedAt:       string
}

// ─── Day Items ────────────────────────────────────────────────────────────────

export type DayItemSource = 'standalone' | 'tree' | 'inbox'

interface BaseDayItem {
  id:           string
  userId:       string
  date:         string           // 'YYYY-MM-DD'
  source:       DayItemSource
  title:        string | null    // for standalone; tree/inbox items use their own title
  treeNodeId:   string | null
  inboxItemId:  string | null
  isComplete:   boolean
  position:     number           // ordering within the floating pool
  createdAt:    string
  updatedAt:    string
}

export interface AnchoredDayItem extends BaseDayItem {
  startTime: string        // 'HH:MM' — presence defines anchored
  endTime:   string | null
}

export interface FloatingDayItem extends BaseDayItem {
  startTime: null          // absence defines floating
  endTime:   null
}

export type DayItem = AnchoredDayItem | FloatingDayItem

// ─── Week & Month Focus ───────────────────────────────────────────────────────

export type FocusSource = 'standalone' | 'tree' | 'inbox'

export interface WeekFocusItem {
  id:           string
  userId:       string
  weekStart:    string           // 'YYYY-MM-DD' — always a Monday
  source:       FocusSource
  title:        string | null
  treeNodeId:   string | null
  inboxItemId:  string | null
  isComplete:   boolean
  position:     number
  createdAt:    string
  updatedAt:    string
}

export interface MonthFocusItem {
  id:           string
  userId:       string
  monthStart:   string           // 'YYYY-MM-DD' — always the 1st of the month
  source:       FocusSource
  title:        string | null
  treeNodeId:   string | null
  inboxItemId:  string | null
  isComplete:   boolean
  position:     number
  createdAt:    string
  updatedAt:    string
}
