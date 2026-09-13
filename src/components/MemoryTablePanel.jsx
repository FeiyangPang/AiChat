import React, { useEffect, useRef, useState } from 'react'
import { getMemoryStore } from '../utils/memory/memory-store'
import { getStatusStore, STATUS_FIELDS } from '../utils/memory/status-store'
import { DEFAULT_MEMORY_TEMPLATE } from '../utils/memory/default-template'
import './MemoryTablePanel.css'

const TABLE_NOTES = {
  story_summary: '最近 8 条已确认剧情。较早事件会归入长期记忆；原始事件保留在本地归档，可随时查看。',
  long_term: '最多 5 组长期剧情，保留事件顺序和来源。更早的组保留在本地归档。',
  core: '由你手动固定的关键事实、约定和伏笔，不设数量上限，也不会被自动压缩覆盖。',
  character_archive: '持续记录出现过的角色、稳定设定与最后已知去向，离场角色也不会因此遗失。',
  archive: '保存轮换出的原始事件和较早的长期记忆。归档可查阅、修改或固定为核心记忆。',
}
const TABLE_LIMITS = { story_summary: 8, long_term: 5 }
const toText = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
const copy = value => JSON.parse(JSON.stringify(value))

function getColumns(table, row) {
  const columns = [...(table?.columns || [])]
  const known = new Set(columns.map(column => column.id))
  Object.keys(row?.row_data || {}).forEach(key => {
    if (!known.has(key)) columns.push({ id: key, name: key, type: 'multiline' })
  })
  return columns
}

function MemoryTablePanel({ isOpen, onClose, onChange }) {
  const [store] = useState(() => getMemoryStore())
  const [statusStore] = useState(() => getStatusStore())
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState({})
  const [tables, setTables] = useState(DEFAULT_MEMORY_TEMPLATE.tables)
  const [activeTable, setActiveTable] = useState('story_summary')
  const [editingRow, setEditingRow] = useState(null)
  const [editingStatus, setEditingStatus] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const panelRef = useRef(null)
  const editRef = useRef(null)

  const refresh = () => {
    const nextRows = store.getAllRows()
    const nextTables = [...(store.getTemplate()?.tables || DEFAULT_MEMORY_TEMPLATE.tables)]
    const known = new Set(nextTables.map(table => table.id))
    nextRows.forEach(row => {
      if (!known.has(row.table_id)) {
        nextTables.push({ id: row.table_id, name: `导入记忆 · ${row.table_id}`, columns: [] })
        known.add(row.table_id)
      }
    })
    setRows(nextRows)
    setTables(nextTables)
    setStatus(statusStore.get())
  }

  useEffect(() => {
    if (!isOpen) return
    refresh()
    setError('')
    setNotice('')
    setEditingRow(null)
    setEditingStatus(null)
    const previousFocus = document.activeElement
    panelRef.current?.focus()
    return () => previousFocus?.focus?.()
  }, [isOpen, store, statusStore])

  useEffect(() => {
    if (editingRow || editingStatus) editRef.current?.focus()
  }, [Boolean(editingRow), Boolean(editingStatus)])

  const runMutation = (action, targetStore = store) => {
    setError('')
    setNotice('')
    try {
      if (!action()) throw new Error(targetStore.getLastError?.() || '操作未保存，请检查浏览器存储空间后重试。')
      refresh()
      onChange?.({ rows: store.getAllRows(), status: statusStore.get() })
      return true
    } catch (cause) {
      setError(cause.message || '保存失败，请重试。')
      return false
    }
  }

  const handleDeleteRow = row => {
    if (!window.confirm('删除这条记忆？此操作不能撤销。')) return
    if (runMutation(() => store.deleteRow(row.id))) setNotice('记忆已删除。')
  }

  const handlePromoteRow = row => {
    if (runMutation(() => store.promoteToCore(row.id))) setNotice('已固定到核心记忆，可在“核心剧情记忆”中查看和编辑。')
  }

  const handleSaveRow = event => {
    event.preventDefault()
    if (!editingRow) return
    if (!Object.values(editingRow.row_data || {}).some(value => toText(value).trim())) {
      setError('请至少填写一项记忆内容。')
      return
    }
    const operation = editingRow.id
      ? () => store.updateRow(editingRow.id, editingRow)
      : () => store.createRow(editingRow)
    if (runMutation(operation)) {
      setEditingRow(null)
      setNotice('记忆已保存。')
      panelRef.current?.focus()
    }
  }

  const handleSaveStatus = event => {
    event.preventDefault()
    if (runMutation(() => statusStore.save(editingStatus), statusStore)) {
      setEditingStatus(null)
      setNotice('当前状态已保存，将用于下一轮剧情。')
      panelRef.current?.focus()
    }
  }

  const closeEditor = () => {
    setEditingRow(null)
    setEditingStatus(null)
    setError('')
    panelRef.current?.focus()
  }

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (editingRow || editingStatus) closeEditor()
      else onClose()
    }
    if (event.key !== 'Tab') return
    const dialog = editingRow || editingStatus ? editRef.current : panelRef.current
    const focusable = Array.from(dialog?.querySelectorAll('button:not([disabled]), input, textarea, select, [tabindex="0"]') || [])
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  if (!isOpen) return null
  const selectedTable = tables.find(table => table.id === activeTable) || tables[0]
  const visibleRows = rows.filter(row => row.table_id === selectedTable?.id).sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0))
  const editingTable = tables.find(table => table.id === editingRow?.table_id)
  const isEditing = Boolean(editingRow || editingStatus)

  return (
    <div className="memory-table-panel-overlay" onClick={isEditing ? undefined : onClose}>
      <div className="memory-table-panel" role="dialog" aria-modal="true" aria-labelledby="memory-panel-title" ref={panelRef} tabIndex={-1} onClick={event => event.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="memory-panel-header">
          <h2 id="memory-panel-title">状态与剧情记忆</h2>
          <button className="memory-panel-close" onClick={onClose} aria-label="关闭记忆面板">×</button>
        </div>

        <div className="memory-panel-content" aria-hidden={isEditing ? true : undefined}>
          {!isEditing && error && <p className="memory-feedback memory-error" role="alert">{error}</p>}
          {notice && <p className="memory-feedback memory-success" role="status">{notice}</p>}
          <section className="memory-section" aria-labelledby="memory-current-status">
            <div className="memory-section-header">
              <h3 id="memory-current-status">当前状态</h3>
              <button className="memory-btn-create" onClick={() => { setError(''); setEditingStatus(copy(status)) }}>编辑状态</button>
            </div>
            <p className="memory-section-note">此处是最新状态。正文后的状态栏保存各轮快照；已知卡片、物品及持续效果会跟随当前状态保留。</p>
            <dl className="status-card">
              {STATUS_FIELDS.map(field => (
                <div key={field.id} className="status-field">
                  <dt className="status-label">{field.label}</dt>
                  <dd className="status-value">{toText(status[field.id]) || '未记录'}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="memory-section" aria-label="分层剧情记忆">
            <div className="memory-table-tabs" aria-label="选择记忆层级">
              {tables.map(table => (
                <button key={table.id} className={`memory-table-tab ${selectedTable?.id === table.id ? 'active' : ''}`} aria-pressed={selectedTable?.id === table.id} onClick={() => { setActiveTable(table.id); setError(''); setNotice('') }}>
                  {table.name}<span>{rows.filter(row => row.table_id === table.id).length}{TABLE_LIMITS[table.id] ? `/${TABLE_LIMITS[table.id]}` : ''}</span>
                </button>
              ))}
            </div>
            <div className="memory-section-header">
              <h3>{selectedTable?.name} · {visibleRows.length} 条</h3>
              {selectedTable && <button className="memory-btn-create" onClick={() => { setError(''); setEditingRow({ table_id: selectedTable.id, row_data: {}, is_pinned: selectedTable.id === 'core' }) }}>+ 新增记忆</button>}
            </div>
            <p className="memory-section-note">{TABLE_NOTES[selectedTable?.id] || selectedTable?.sourceData?.note}</p>
            <div className="memory-rows-list">
              {visibleRows.length === 0 && <div className="memory-empty">暂无{selectedTable?.name}</div>}
              {visibleRows.map(row => (
                <article key={row.id} className={`memory-row-item ${row.table_id === 'core' || row.is_pinned ? 'pinned' : ''}`}>
                  <div className="memory-row-header">
                    {(row.table_id === 'core' || row.is_pinned) && <span className="memory-pin-label">◆ 已固定</span>}
                    {row.table_id !== 'core' && <button className="memory-btn-pin" onClick={() => handlePromoteRow(row)}>固定为核心</button>}
                    <button className="memory-btn-edit" onClick={() => { setError(''); setEditingRow(copy(row)) }}>编辑</button>
                    <button className="memory-btn-delete" onClick={() => handleDeleteRow(row)}>删除</button>
                  </div>
                  <dl className="memory-row-content">
                    {getColumns(selectedTable, row).map(column => (
                      <div key={column.id} className="memory-row-field">
                        <dt className="memory-field-label">{column.name}</dt>
                        <dd className="memory-field-value">{toText(row.row_data?.[column.id]) || '未记录'}</dd>
                      </div>
                    ))}
                  </dl>
                  {Array.isArray(row.source_rows) && row.source_rows.length > 0 && (
                    <section className="memory-source-records" aria-label="原始剧情记录">
                      <h4>原始剧情记录 · {row.source_rows.length} 条</h4>
                      <ol>{row.source_rows.map((source, index) => (
                        <li key={source.id || index}>
                          <dl className="memory-row-content">{getColumns(tables.find(table => table.id === source.table_id), source).map(column => (
                            <div key={column.id} className="memory-row-field">
                              <dt className="memory-field-label">{column.name}</dt>
                              <dd className="memory-field-value">{toText(source.row_data?.[column.id]) || '未记录'}</dd>
                            </div>
                          ))}</dl>
                        </li>
                      ))}</ol>
                    </section>
                  )}
                  {Array.isArray(row.profile_history) && row.profile_history.length > 0 && (
                    <section className="memory-source-records" aria-label="历史角色资料">
                      <h4>历史角色资料 · {row.profile_history.length} 份</h4>
                      <ol>{row.profile_history.map((profile, index) => <li key={index}><p className="memory-field-value">{toText(profile)}</p></li>)}</ol>
                    </section>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        {isEditing && (
          <div className="memory-edit-overlay">
            <div className="memory-edit-modal" role="dialog" aria-modal="true" aria-labelledby="memory-edit-title" ref={editRef} tabIndex={-1}>
              <div className="memory-edit-header">
                <h3 id="memory-edit-title">{editingStatus ? '编辑当前状态' : `${editingRow.id ? '编辑' : '新增'}${editingTable?.name || '记忆'}`}</h3>
                <button className="memory-edit-close" onClick={closeEditor} aria-label="关闭编辑">×</button>
              </div>
              <form className="memory-edit-content" onSubmit={editingStatus ? handleSaveStatus : handleSaveRow}>
                {error && <p className="memory-feedback memory-error" role="alert">{error}</p>}
                {(editingStatus ? STATUS_FIELDS : getColumns(editingTable, editingRow)).map(field => {
                  const value = editingStatus ? editingStatus[field.id] : editingRow.row_data?.[field.id]
                  const inputId = `memory-edit-${field.id}`
                  const update = event => editingStatus
                    ? setEditingStatus({ ...editingStatus, [field.id]: event.target.value })
                    : setEditingRow({ ...editingRow, row_data: { ...editingRow.row_data, [field.id]: event.target.value } })
                  return (
                    <div key={field.id} className="memory-edit-field">
                      <label htmlFor={inputId}>{field.label || field.name}</label>
                      {field.multiline || field.type === 'multiline' || toText(value).includes('\n')
                        ? <textarea id={inputId} value={toText(value)} onChange={update} className="memory-edit-input memory-edit-textarea" rows={4} />
                        : <input id={inputId} type="text" value={toText(value)} onChange={update} className="memory-edit-input" />}
                    </div>
                  )
                })}
                <div className="memory-edit-actions">
                  <button className="memory-btn-save" type="submit">保存</button>
                  <button className="memory-btn-cancel" type="button" onClick={closeEditor}>取消</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MemoryTablePanel
