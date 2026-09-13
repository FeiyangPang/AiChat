export const SESSION_KEY = 'rpg_game_session_v1'
export const SESSION_BACKUP_KEY = 'rpg_invalid_session_backup_v1'
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const isValidSnapshot = snapshot => isRecord(snapshot) && Array.isArray(snapshot.rows) &&
  isRecord(snapshot.status) && Object.values(snapshot.status).every(value => typeof value === 'string') &&
  snapshot.rows.every(row => isRecord(row) && typeof row.id === 'string' &&
    typeof row.table_id === 'string' && isRecord(row.row_data))

const displayRows = rows => rows?.map(({ source_rows, profile_history, ...row }) => row)

export function loadGameSession() {
  let raw
  try {
    raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (saved?.version !== 1 || !Array.isArray(saved.messages) || !isValidSnapshot(saved.snapshot) ||
      saved.messages.some(m => !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string' ||
        (m.before && !isValidSnapshot(m.before)))) throw new Error('存档结构无效')
    return saved
  } catch {
    try { if (raw && !localStorage.getItem(SESSION_BACKUP_KEY)) localStorage.setItem(SESSION_BACKUP_KEY, raw) } catch { /* preserve source if storage is full */ }
    return null
  }
}

// This envelope is authoritative on reload, so chat, memory and undo remain aligned.
export function saveGameSession(session) {
  try {
    if (!isValidSnapshot(session.snapshot)) return false
    const messages = session.messages.map(({ before, ...message }, index, all) => ({
      ...message, ...(message.memories ? { memories: displayRows(message.memories) } : {}),
      ...(index >= all.length - 40 && before ? { before } : {}),
    }))
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      version: 1, messages, snapshot: session.snapshot, gameStarted: Boolean(session.gameStarted),
      worldBook: session.worldBook || '', role: session.role || { name: '', description: '' },
      messageMode: session.messageMode || 'long', targetRole: session.targetRole || '',
    }))
    return true
  } catch { return false }
}
