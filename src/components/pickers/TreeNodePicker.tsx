import { useState, useMemo, useRef, type CSSProperties } from 'react'
import { buildTree, countDescendants, type TreeNodeWithChildren } from '../../hooks/useTreeNodes'
import type { TreeNode, NodeType } from '../../types'
import { useT } from '../../i18n'
import NodeConnector from '../tree/NodeConnector'
import styles from './TreeNodePicker.module.css'

type ViewMode = 'list' | 'tree'

function nodeVars(type: NodeType): CSSProperties {
  return {
    '--ns-node-accent':     `var(--ns-${type}-accent)`,
    '--ns-node-accent-rgb': `var(--ns-${type}-accent-rgb)`,
  } as CSSProperties
}

/** True if any descendant (not the node itself) is already scheduled in the
 *  current period — drives the parent's subtle "contains a scheduled item"
 *  indicator dot. */
function hasFocusedDescendant(node: TreeNodeWithChildren, focused: Set<string>): boolean {
  for (const child of node.children) {
    if (focused.has(child.id) || hasFocusedDescendant(child, focused)) return true
  }
  return false
}

/** Nodes that match the search query themselves, or have a descendant that
 *  does — the set of ids that should stay visible while filtering. Ancestors
 *  of a match are kept so the match stays reachable in the hierarchy. */
function buildMatchSet(roots: TreeNodeWithChildren[], query: string): Set<string> {
  const q = query.trim().toLowerCase()
  const matched = new Set<string>()
  function walk(n: TreeNodeWithChildren): boolean {
    const selfMatch = n.title.toLowerCase().includes(q)
    const childMatch = n.children.reduce((acc, c) => walk(c) || acc, false)
    if (selfMatch || childMatch) { matched.add(n.id); return true }
    return false
  }
  roots.forEach(walk)
  return matched
}

interface Props {
  /** Flat node list — already filtered by the caller (e.g. exclude complete). */
  nodes:           TreeNode[]
  selectedIds:     Set<string>
  onToggleSelect:  (id: string) => void
  /** treeNodeIds already scheduled in the current day/week/month — drives the
   *  parent "contains a scheduled item" indicator. */
  focusedNodeIds?: Set<string>
  /** Used in the indicator's tooltip, e.g. "today" / "this week" / "this month". */
  focusLabel?:     string
  emptyHint?:      string
  /** ids that render (and still count toward every ancestor's "N inside" /
   *  focus-dot indicators) but can't be selected — e.g. SheetForm's attach
   *  picker needs to exclude nodes already living in a sheet without
   *  hiding them from the tree, since hiding would silently undercount
   *  their ancestors (TASKS.md §3.5's audit rule: only canvas rendering
   *  filters by sheet_id, never a count). Omit for the ordinary case where
   *  every passed-in node is a valid selection. */
  disabledIds?:    Set<string>
}

export default function TreeNodePicker({
  nodes, selectedIds, onToggleSelect, focusedNodeIds, focusLabel, emptyHint,
  disabledIds,
}: Props) {
  const t = useT()
  focusLabel = focusLabel ?? t('pickers.focusLabelDefault')
  emptyHint  = emptyHint  ?? t('pickers.noNodesFound')
  const disabled = disabledIds ?? new Set<string>()
  const [viewMode, setViewMode]     = useState<ViewMode>('list')
  const [search,   setSearch]       = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const focused = focusedNodeIds ?? new Set<string>()
  const roots   = useMemo(() => buildTree(nodes), [nodes])
  const matchSet = useMemo(
    () => (search.trim() ? buildMatchSet(roots, search) : null),
    [search, roots],
  )
  const visibleRoots = matchSet ? roots.filter(r => matchSet.has(r.id)) : roots

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const stageRef = useRef<HTMLDivElement | null>(null)
  const nodesRef = useRef<HTMLDivElement>(null)

  return (
    <div className={styles.picker}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder={t('habits.searchNodesPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.viewToggle} role="group" aria-label={t('pickers.displayModeGroupLabel')}>
          <button
            className={`${styles.viewBtn}${viewMode === 'list' ? ' ' + styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >{t('pickers.viewList')}</button>
          <button
            className={`${styles.viewBtn}${viewMode === 'tree' ? ' ' + styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('tree')}
            aria-pressed={viewMode === 'tree'}
          >{t('pickers.viewTree')}</button>
        </div>
        {selectedIds.size > 0 && (
          <span className={styles.selectedCount}>{t('day.selectedCount', { n: selectedIds.size })}</span>
        )}
      </div>

      {visibleRoots.length === 0 ? (
        <p className={styles.emptyHint}>{emptyHint}</p>
      ) : viewMode === 'list' ? (
        <div className={styles.listBody}>
          {visibleRoots.map(n => (
            <ListRow
              key={n.id} node={n}
              selectedIds={selectedIds} onToggleSelect={onToggleSelect}
              focused={focused} focusLabel={focusLabel}
              expandedIds={expandedIds} onToggleExpand={toggleExpand}
              matchSet={matchSet}
              disabledIds={disabled}
            />
          ))}
        </div>
      ) : (
        <div ref={stageRef} className={styles.treeStage}>
          <NodeConnector stageRef={stageRef} nodesRef={nodesRef} zoom={1} />
          <div ref={nodesRef} className={styles.treeNodes}>
            {visibleRoots.map(n => (
              <TreeCanvasRow
                key={n.id} node={n} parentId={null}
                selectedIds={selectedIds} onToggleSelect={onToggleSelect}
                focused={focused} focusLabel={focusLabel}
                matchSet={matchSet}
                disabledIds={disabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Indented list row ─────────────────────────────────────────────────────────

interface ListRowProps {
  node:            TreeNodeWithChildren
  selectedIds:     Set<string>
  onToggleSelect:  (id: string) => void
  focused:         Set<string>
  focusLabel:      string
  expandedIds:     Set<string>
  onToggleExpand:  (id: string) => void
  matchSet:        Set<string> | null
  disabledIds:     Set<string>
}

function ListRow({
  node, selectedIds, onToggleSelect, focused, focusLabel, expandedIds, onToggleExpand, matchSet, disabledIds,
}: ListRowProps) {
  const t = useT()
  const hasChildren = node.children.length > 0
  // While searching, every visible branch is auto-expanded so matches stay reachable.
  const expanded = matchSet ? true : expandedIds.has(node.id)
  const isSelected = selectedIds.has(node.id)
  const isDisabled = disabledIds.has(node.id)
  const descendantFocused = hasFocusedDescendant(node, focused)
  const visibleChildren = matchSet ? node.children.filter(c => matchSet.has(c.id)) : node.children

  function toggle() {
    if (!isDisabled) onToggleSelect(node.id)
  }

  return (
    <div className={styles.listNodeWrap}>
      <div
        className={`${styles.listRow}${isSelected ? ' ' + styles.listRowSelected : ''}${isDisabled ? ' ' + styles.listRowDisabled : ''}`}
        onClick={toggle}
        title={isDisabled ? t('pickers.notAvailableHere') : undefined}
      >
        {hasChildren ? (
          <button
            className={`${styles.chevron}${expanded ? ' ' + styles.chevronOpen : ''}`}
            onClick={e => { e.stopPropagation(); onToggleExpand(node.id) }}
            aria-label={expanded ? t('inbox.collapseAriaLabel') : t('pickers.expand')}
          >⌄</button>
        ) : (
          <span className={styles.chevronSpacer} />
        )}
        <button
          className={`${styles.checkbox}${isSelected ? ' ' + styles.checkboxChecked : ''}`}
          onClick={e => { e.stopPropagation(); toggle() }}
          disabled={isDisabled}
          aria-label={isSelected ? t('pickers.deselect') : t('pickers.select')}
        >{isSelected ? '✓' : ''}</button>
        <span className={styles.typeDot} style={{ background: `var(--ns-${node.type}-accent)` }} />
        <span className={styles.rowTitle}>{node.title}</span>
        <span className={styles.rowTypeBadge}>{node.type}</span>
        {hasChildren && (
          <span className={styles.childCount}>{t('tree.childCountInside', { n: countDescendants(node) })}</span>
        )}
        {descendantFocused && (
          <span className={styles.focusDot} title={t('pickers.containsItemIn', { focusLabel })} />
        )}
      </div>
      {hasChildren && expanded && (
        <div className={styles.listChildren}>
          {visibleChildren.map(c => (
            <ListRow
              key={c.id} node={c}
              selectedIds={selectedIds} onToggleSelect={onToggleSelect}
              focused={focused} focusLabel={focusLabel}
              expandedIds={expandedIds} onToggleExpand={onToggleExpand}
              matchSet={matchSet}
              disabledIds={disabledIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tree (branching) canvas row ─────────────────────────────────────────────

interface CanvasRowProps {
  node:            TreeNodeWithChildren
  parentId:        string | null
  selectedIds:     Set<string>
  onToggleSelect:  (id: string) => void
  focused:         Set<string>
  focusLabel:      string
  matchSet:        Set<string> | null
  disabledIds:     Set<string>
}

function TreeCanvasRow({
  node, parentId, selectedIds, onToggleSelect, focused, focusLabel, matchSet, disabledIds,
}: CanvasRowProps) {
  const t = useT()
  // Expanded by default, mirroring the main tree view's own convention.
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = node.children.length > 0
  const isSelected = selectedIds.has(node.id)
  const isDisabled = disabledIds.has(node.id)
  const descendantFocused = hasFocusedDescendant(node, focused)
  const visibleChildren = matchSet ? node.children.filter(c => matchSet.has(c.id)) : node.children
  const showChildren = hasChildren && !collapsed && visibleChildren.length > 0

  function toggle() {
    if (!isDisabled) onToggleSelect(node.id)
  }

  return (
    <div className={styles.canvasRow} style={nodeVars(node.type)}>
      <div
        data-node-id={node.id}
        data-parent-id={parentId ?? ''}
        data-type={node.type}
        data-state={node.status}
        className={`${styles.canvasCard}${isSelected ? ' ' + styles.canvasCardSelected : ''}${node.status === 'complete' ? ' ' + styles.canvasCardDone : ''}${isDisabled ? ' ' + styles.canvasCardDisabled : ''}`}
        onClick={toggle}
        title={isDisabled ? t('pickers.notAvailableHere') : undefined}
      >
        <button
          className={`${styles.checkbox}${isSelected ? ' ' + styles.checkboxChecked : ''}`}
          onClick={e => { e.stopPropagation(); toggle() }}
          disabled={isDisabled}
          aria-label={isSelected ? t('pickers.deselect') : t('pickers.select')}
        >{isSelected ? '✓' : ''}</button>
        <div className={styles.canvasCardBody}>
          <div className={styles.canvasCardHead}>
            <span className={styles.canvasType}>{node.type}</span>
            {hasChildren && (
              <button
                className={styles.canvasChev}
                onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
                aria-label={collapsed ? t('pickers.expand') : t('inbox.collapseAriaLabel')}
              >{collapsed ? '›' : '⌄'}</button>
            )}
          </div>
          <span className={styles.canvasTitle}>{node.title}</span>
          <div className={styles.canvasMeta}>
            {hasChildren && (
              <span className={styles.childCount}>{t('tree.childCountInside', { n: countDescendants(node) })}</span>
            )}
            {descendantFocused && (
              <span className={styles.focusDot} title={t('pickers.containsItemIn', { focusLabel })} />
            )}
          </div>
        </div>
      </div>
      {showChildren && (
        <div className={styles.canvasChildren}>
          {visibleChildren.map(c => (
            <TreeCanvasRow
              key={c.id} node={c} parentId={node.id}
              selectedIds={selectedIds} onToggleSelect={onToggleSelect}
              focused={focused} focusLabel={focusLabel}
              matchSet={matchSet}
              disabledIds={disabledIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}
