import { extractStatusEdit } from './status-edit-parser.js'
import { extractTableEditBlocks, stripTableEditBlocks } from './memory-edit-parser.js'
import { isValidSnapshot } from '../game-session.js'

export const captureTurnState = (memoryStore, statusStore) => ({
  rows: memoryStore.getAllRows(), status: statusStore.get(),
})

export function restoreTurnState(snapshot, memoryStore, statusStore) {
  if (!isValidSnapshot(snapshot)) throw new Error('存档快照无效，原有记忆已保留')
  const previous = captureTurnState(memoryStore, statusStore)
  const memoryChanged = JSON.stringify(snapshot.rows) !== JSON.stringify(previous.rows)
  const statusChanged = JSON.stringify(snapshot.status) !== JSON.stringify(previous.status)
  if (memoryChanged && !memoryStore.saveRows(snapshot.rows, { rebalance: false })) {
    throw new Error('记忆保存失败，请先导出存档释放浏览器空间')
  }
  if (statusChanged && !statusStore.replace(snapshot.status)) {
    if (memoryChanged) memoryStore.saveRows(previous.rows, { rebalance: false })
    throw new Error('状态保存失败，撤回未完成')
  }
}

export function applyTurnResponse({ response, memoryStore, statusStore, turnId, rowIndexMap = {}, tableOrder = [] }) {
  const before = captureTurnState(memoryStore, statusStore)
  const statusResult = extractStatusEdit(response)
  const memoryResult = extractTableEditBlocks(statusResult.text)
  const content = stripTableEditBlocks(memoryResult.text)
    .replace(/<statusEdit\b[^>]*>[\s\S]*$/i, '').trim()
  if (!content) throw new Error('本轮没有有效正文，请重试')
  const actions = memoryResult.actions.filter(action => {
    const table = action.tableId || tableOrder[action.tableIndex]
    return action.action === 'insert' && table === 'story_summary' &&
      typeof action.data?.plot === 'string' && action.data.plot.trim()
  })
  const validStatus = statusResult.status && Object.keys(statusResult.status).length > 0
  let warning = ''
  if (!validStatus || !actions.length) {
    warning = '本轮状态或记忆格式不完整，已保留上轮数据；可撤回后重试。'
  } else {
    try {
      if (!statusStore.save(statusResult.status)) throw new Error('状态写入失败')
      // Each accepted reply corresponds to exactly one chronological summary.
      memoryStore.applyMemoryEdits([actions[0]], rowIndexMap, tableOrder, { turnId })
      memoryStore.syncCharacterRecords(statusStore.get(), { turnId })
      if (memoryStore.getLastError?.()) throw new Error(memoryStore.getLastError())
    } catch (error) {
      restoreTurnState(before, memoryStore, statusStore)
      throw error
    }
  }
  return {
    id: turnId, role: 'assistant', content, before, warning,
    status: statusStore.get(),
    memories: memoryStore.getAllRows().filter(row => row.table_id !== 'archive')
      .map(({ source_rows, profile_history, ...row }) => row),
  }
}
