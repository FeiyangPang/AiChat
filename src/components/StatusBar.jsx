import React from 'react'
import { renderStatusText } from '../utils/memory/status-store'
import { DEFAULT_MEMORY_TEMPLATE } from '../utils/memory/default-template'
import './StatusBar.css'

const MEMORY_SECTIONS = [
  { id: 'story_summary', title: '📑 剧情记忆', limit: 8 },
  { id: 'long_term', title: '📚 长期剧情记忆', limit: 5 },
  { id: 'core', title: '💎 核心剧情记忆' },
  { id: 'character_archive', title: '🔍 角色记录' },
]
const toText = value => value == null || value === '' ? '未记录' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

function rowText(row, tableId) {
  const columns = DEFAULT_MEMORY_TEMPLATE.tables.find(table => table.id === tableId)?.columns || []
  const fields = new Map(columns.map(column => [column.id, column.name]))
  Object.keys(row.row_data || {}).forEach(key => {
    if (!fields.has(key)) fields.set(key, key)
  })
  if (!fields.size) return '未记录'
  return [...fields].map(([key, label]) => `${label}：${toText(row.row_data?.[key])}`).join('\n')
}

/** 每轮剧情结束时的完整只读快照。所有模型内容均按纯文本显示。 */
export default function StatusBar({ status = {}, rows = [], warning }) {
  const memoryRows = Array.isArray(rows) ? rows : []
  const archiveCount = memoryRows.filter(row => row.table_id === 'archive').length
  return (
    <section className="story-status-bar" aria-label="本轮后置状态栏">
      <div className="story-status-heading"><h3>后置状态栏</h3><span>本轮结束时</span></div>
      {warning && <p className="story-status-warning" role="status">{warning}</p>}
      <pre className="story-status-text">{renderStatusText(status) || '状态尚未记录'}</pre>
      {MEMORY_SECTIONS.map(section => {
        const sectionRows = memoryRows.filter(row => row.table_id === section.id)
        return (
          <section key={section.id} className="story-memory-section" aria-label={section.title}>
            <h4>{section.title}<span>当前数量：{sectionRows.length}{section.limit ? `/${section.limit}` : ''}</span></h4>
            {sectionRows.length === 0
              ? <p className="story-memory-empty">暂无记录</p>
              : <ol className="story-memory-list">{sectionRows.map((row, index) => <li key={row.id || `${section.id}-${index}`}><pre>{rowText(row, section.id)}</pre></li>)}</ol>}
          </section>
        )
      })}
      {archiveCount > 0 && <p className="story-status-archive-note">另有 {archiveCount} 条本地归档，可在“记忆”面板中查看。</p>}
    </section>
  )
}
