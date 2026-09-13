import { DEFAULT_MEMORY_TEMPLATE } from './default-template.js';

const STORAGE_KEY_TEMPLATE = 'rpg_memory_template';
const STORAGE_KEY_ROWS = 'rpg_memory_rows';
const STORAGE_KEY_TEMPLATE_VERSION = 'rpg_memory_template_version';
export const MEMORY_MIGRATION_BACKUP_KEY = 'rpg_memory_migration_backup_v4';
export const MEMORY_MAX_ROWS = 8;
export const LONG_TERM_MAX_ROWS = 5;
export const LONG_TERM_BATCH_SIZE = 8;

const clone = value => JSON.parse(JSON.stringify(value));
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const safeData = data => isRecord(data)
  ? Object.fromEntries(Object.entries(data).filter(([key, value]) => !['__proto__', 'constructor', 'prototype'].includes(key) && typeof value === 'string'))
  : {};
const chronological = (a, b) => (Number(a.created_at) || 0) - (Number(b.created_at) || 0);
const protectedRow = row => row.is_pinned || row.table_id === 'core';
const newId = () => `mem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
const canonical = value => JSON.stringify(isRecord(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);

const unknownProfileValue = value => !String(value || '').trim() || /^(?:未知|未记录|未确认|未提及|不详|暂无信息|—|-)$/u.test(String(value).trim());
const profileFieldKey = label => {
  const normalized = label.trim().replace(/^[-*•]\s*/, '').replace(/\s/g, '').toLowerCase();
  const aliases = { 名字: '姓名', 衣饰: '衣着', 服装: '衣着', 位置与姿势: '位置&姿势', '位置＆姿势': '位置&姿势' };
  return aliases[normalized] || normalized;
};
const packedIdentity = line => line.match(/^\s*(?:\d+[.、]\s*)?\[([^\]\n]+\|[^\]\n]*)\](.*)$/);

/** Only explicit field updates replace facts; omitted fields remain in the active profile. */
export function mergeCharacterProfiles(previous, incoming) {
  const splitFields = text => {
    const fields = new Map();
    let currentKey = null;
    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const identity = packedIdentity(line);
      const property = line.match(/^([^：:]{1,40})[：:]\s*(.*)$/);
      if (identity) {
        currentKey = null;
        fields.set('@identity', { text: line, value: identity[1] });
      } else if (property) {
        currentKey = profileFieldKey(property[1]);
        fields.set(currentKey, { text: line, value: property[2] });
      } else if (currentKey) {
        const field = fields.get(currentKey);
        field.text += `\n${line}`;
        field.value += `\n${line}`;
      } else if (!unknownProfileValue(line)) {
        // Unlabelled facts cannot safely be matched semantically, so retain each once.
        fields.set(`@fact:${line}`, { text: line, value: line });
      }
    }
    return fields;
  };
  const fields = splitFields(previous);
  for (const [key, field] of splitFields(incoming)) {
    const old = fields.get(key);
    if (old && unknownProfileValue(field.value)) continue;
    if (key === '@identity' && old) {
      const oldCard = packedIdentity(old.text);
      const newCard = packedIdentity(field.text);
      const oldParts = oldCard[1].split('|');
      const newParts = newCard[1].split('|');
      // Positional cards follow the same template: blank slots and omitted tail slots
      // keep their last known values. Named fields below are preferable for updates.
      const merged = Array.from({ length: Math.max(oldParts.length, newParts.length) }, (_, index) =>
        unknownProfileValue(newParts[index]) ? oldParts[index] || newParts[index] || '' : newParts[index]);
      const prefix = field.text.slice(0, field.text.indexOf('['));
      field.text = `${prefix}[${merged.join('|')}]${newCard[2] || oldCard[2]}`;
      field.value = merged.join('|');
    }
    fields.set(key, field);
  }
  return [...fields.values()].map(field => field.text).join('\n');
}

function patchCharacterRow(target, patch) {
  const previousProfile = target.row_data?.profile || '';
  const changes = { ...patch };
  if (typeof changes.profile === 'string') changes.profile = mergeCharacterProfiles(previousProfile, changes.profile);
  target.row_data = { ...target.row_data, ...changes };
  if (previousProfile && typeof changes.profile === 'string' && previousProfile !== changes.profile) {
    target.profile_history ||= [];
    if (!target.profile_history.includes(previousProfile)) target.profile_history.push(previousProfile);
  }
  target.updated_at = Date.now();
}

function buildLongTermData(sources) {
  const unique = field => [...new Set(sources.map(row => row.row_data?.[field]).filter(Boolean))].join('；');
  const plot = sources.map((row, index) => {
    const data = row.row_data || {};
    return `${index + 1}. ${Object.entries(data).map(([key, value]) => `${key}：${typeof value === 'string' ? value : JSON.stringify(value)}`).join('｜')}`;
  }).join('\n');
  return { time: unique('time'), location: unique('location'), characters: unique('characters'), plot, tone: unique('tone') };
}

/** Deterministic retention: source rows remain intact inside fixed-size batches. */
export function rebalanceMemoryRows(rows) {
  const list = clone(rows);
  for (const row of list) {
    if (row.is_pinned && ['story_summary', 'long_term'].includes(row.table_id)) {
      row.original_table_id ||= row.table_id;
      row.table_id = 'core';
    }
  }
  const recent = list.filter(row => row.table_id === 'story_summary' && !protectedRow(row)).sort(chronological);
  const overflow = recent.slice(0, Math.max(0, recent.length - MEMORY_MAX_ROWS));
  for (const source of overflow) {
    list.splice(list.findIndex(row => row.id === source.id), 1);
    const batches = list.filter(row => row.table_id === 'long_term' && !protectedRow(row)).sort(chronological);
    let batch = batches.at(-1);
    if (!batch || batch.manually_edited || !Array.isArray(batch.source_rows) || batch.source_rows.length >= LONG_TERM_BATCH_SIZE) {
      batch = {
        id: `long_${source.id}`, table_id: 'long_term', row_data: {}, source_rows: [], source_row_ids: [],
        is_pinned: false, priority: 0, created_at: source.created_at || 0, updated_at: source.updated_at || 0,
      };
      list.push(batch);
    }
    batch.source_rows.push(source);
    batch.source_row_ids.push(source.id);
    batch.row_data = buildLongTermData(batch.source_rows);
    batch.updated_at = source.updated_at || batch.updated_at;
  }
  const longTerm = list.filter(row => row.table_id === 'long_term' && !protectedRow(row)).sort(chronological);
  for (const row of longTerm.slice(0, Math.max(0, longTerm.length - LONG_TERM_MAX_ROWS))) {
    row.original_table_id = 'long_term';
    row.table_id = 'archive';
  }
  return list;
}

export class MemoryStore {
  constructor() {
    this.lastError = '';
    this.template = this.loadTemplate();
    this.rows = this.loadRows();
    const balanced = rebalanceMemoryRows(this.rows);
    if (JSON.stringify(balanced) !== JSON.stringify(this.rows)) this.saveRows(balanced, { rebalance: false });
  }

  getLastError() { return this.lastError; }

  loadTemplate() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_TEMPLATE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isRecord(parsed) && Array.isArray(parsed.tables)) {
          if (parsed.meta?.version !== DEFAULT_MEMORY_TEMPLATE.meta.version) return this.migrateToNewTemplate(parsed);
          return parsed;
        }
        throw new Error('模板结构无效');
      }
      this.saveTemplate(clone(DEFAULT_MEMORY_TEMPLATE));
    } catch (error) { this.lastError = `加载模板失败：${error.message}`; }
    return clone(DEFAULT_MEMORY_TEMPLATE);
  }

  /** Back up the exact old payload before touching either template or row data. */
  migrateToNewTemplate(oldTemplate) {
    try {
      if (!localStorage.getItem(MEMORY_MIGRATION_BACKUP_KEY)) {
        localStorage.setItem(MEMORY_MIGRATION_BACKUP_KEY, JSON.stringify({
          saved_at: Date.now(), template: localStorage.getItem(STORAGE_KEY_TEMPLATE), rows: localStorage.getItem(STORAGE_KEY_ROWS),
        }));
      }
      const merged = clone(DEFAULT_MEMORY_TEMPLATE);
      merged.meta = { ...(oldTemplate.meta || {}), ...merged.meta };
      merged.tables = merged.tables.map(table => {
        const previous = oldTemplate.tables?.find(item => item?.id === table.id);
        if (!previous) return table;
        const columns = [...table.columns, ...(previous.columns || []).filter(column => !table.columns.some(item => item.id === column.id))];
        return { ...previous, ...table, columns };
      });
      merged.tables.push(...(oldTemplate.tables || []).filter(table => !merged.tables.some(item => item.id === table.id)));
      if (!this.saveTemplate(merged)) return clone(oldTemplate);
      return merged;
    } catch (error) {
      this.lastError = `模板迁移失败，保留原数据：${error.message}`;
      return clone(oldTemplate);
    }
  }

  saveTemplate(template) {
    if (!isRecord(template) || !Array.isArray(template.tables)) return false;
    try {
      const value = clone(template);
      localStorage.setItem(STORAGE_KEY_TEMPLATE, JSON.stringify(value));
      localStorage.setItem(STORAGE_KEY_TEMPLATE_VERSION, value.meta?.version || '1.0.0');
      this.template = value;
      this.lastError = '';
      return true;
    } catch (error) { this.lastError = `保存模板失败：${error.message}`; return false; }
  }

  getTemplate() { return clone(this.template); }

  loadRows() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ROWS);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.some(row => !isRecord(row))) throw new Error('记忆数据结构无效');
      return parsed;
    } catch (error) { this.lastError = `加载记忆失败，原始数据仍在本地存储中：${error.message}`; return []; }
  }

  saveRows(rows, { rebalance = true } = {}) {
    if (!Array.isArray(rows) || rows.some(row => !isRecord(row))) {
      this.lastError = '记忆数据结构无效';
      return false;
    }
    try {
      const next = rebalance ? rebalanceMemoryRows(rows) : clone(rows);
      localStorage.setItem(STORAGE_KEY_ROWS, JSON.stringify(next));
      this.rows = next;
      this.lastError = '';
      return true;
    } catch (error) { this.lastError = `保存记忆失败：${error.message}`; return false; }
  }

  getAllRows() { return clone(this.rows); }
  getRowsByTable(tableId) { return clone(this.rows.filter(row => row.table_id === tableId)); }
  getInjectableRows() { return clone(this.rows.filter(row => row.table_id !== 'archive')); }

  makeRow(row) {
    return {
      id: newId(), table_id: String(row.table_id || 'story_summary'), row_data: safeData(row.row_data),
      is_pinned: Boolean(row.is_pinned || row.table_id === 'core'),
      priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
      updated_at: Date.now(), created_at: Date.now(),
      ...(typeof row.source_turn_id === 'string' ? { source_turn_id: row.source_turn_id } : {}),
    };
  }

  createRow(row) {
    if (!isRecord(row)) return null;
    const created = this.makeRow(row);
    if (!this.saveRows([...this.rows, created])) return null;
    return clone(this.rows.find(item => item.id === created.id) || created);
  }

  updateRow(rowId, updates) {
    const rows = this.getAllRows();
    const target = rows.find(row => row.id === rowId);
    if (!target || !isRecord(updates)) return null;
    Object.assign(target, { ...updates, id: target.id, created_at: target.created_at, updated_at: Date.now() });
    if (Object.hasOwn(updates, 'row_data')) {
      target.row_data = safeData(updates.row_data);
      // An edited batch is sealed, so later automatic aggregation cannot overwrite it.
      if (target.table_id === 'long_term') target.manually_edited = true;
    }
    if (!this.saveRows(rows)) return null;
    return this.getAllRows().find(row => row.id === rowId) || null;
  }

  promoteToCore(rowId) {
    const row = this.rows.find(item => item.id === rowId);
    if (!row) return null;
    return this.updateRow(rowId, { table_id: 'core', is_pinned: true, original_table_id: row.original_table_id || row.table_id });
  }

  deleteRow(rowId) {
    if (!this.rows.some(row => row.id === rowId)) return false;
    return this.saveRows(this.rows.filter(row => row.id !== rowId));
  }

  batchCreateRows(rows) {
    if (!Array.isArray(rows)) return [];
    const created = rows.filter(isRecord).map(row => this.makeRow(row));
    return this.saveRows([...this.rows, ...created]) ? clone(created) : [];
  }

  batchDeleteRows(ids) { return Array.isArray(ids) && this.saveRows(this.rows.filter(row => !ids.includes(row.id))); }

  /** Model protocol writes only append facts or update ordinary character records. */
  applyMemoryEdits(actions, rowIndexMap = {}, tableOrder = [], { turnId = '' } = {}) {
    const rows = this.getAllRows();
    const seen = new Set();
    const existingTurnActions = new Set();
    const collectActions = row => {
      if (row.source_turn_id === turnId && row.source_action_key) existingTurnActions.add(row.source_action_key);
      for (const source of row.source_rows || []) collectActions(source);
    };
    if (turnId) rows.forEach(collectActions);
    for (const action of Array.isArray(actions) ? actions : []) {
      if (!isRecord(action)) continue;
      const type = String(action.action || '').toLowerCase();
      let tableId = String(action.tableId || action.tableName || '').trim();
      if (!tableId && action.tableIndex != null && Number.isInteger(Number(action.tableIndex))) tableId = tableOrder[Number(action.tableIndex)] || '';
      const table = this.template.tables.find(item => item.id === tableId || item.name === tableId);
      tableId = table?.id || tableId;
      if (!['story_summary', 'character_archive'].includes(tableId)) continue;
      if (!['insert', 'init', 'update', 'delete'].includes(type)) continue;
      const data = safeData(action.data);
      if (tableId === 'character_archive' && data.name) data.name = data.name.trim();
      const rowIndex = action.rowIndex != null && Number.isInteger(Number(action.rowIndex)) ? Number(action.rowIndex) : null;
      const rowId = String(action.rowId || (rowIndex != null ? rowIndexMap?.[tableId]?.[rowIndex] : '') || '');
      const actionKey = canonical({ type: type === 'init' ? 'insert' : type, tableId, rowId, data: canonical(data) });
      if (seen.has(actionKey) || (turnId && existingTurnActions.has(actionKey))) continue;
      seen.add(actionKey);
      if (type === 'insert' || type === 'init') {
        if (!Object.keys(data).length || (tableId === 'story_summary' && !data.plot?.trim()) || (tableId === 'character_archive' && !data.name?.trim())) continue;
        if (tableId === 'character_archive') {
          const previous = rows.find(row => row.table_id === tableId && row.row_data?.name === data.name);
          if (previous) {
            if (!protectedRow(previous)) patchCharacterRow(previous, data);
            continue;
          }
        }
        const created = this.makeRow({ table_id: tableId, row_data: data, source_turn_id: turnId });
        created.source_action_key = actionKey;
        rows.push(created);
      } else if (type === 'update' && tableId === 'character_archive' && Object.keys(data).length) {
        const target = rows.find(row => row.id === rowId && row.table_id === tableId);
        if (target && !protectedRow(target)) patchCharacterRow(target, data);
      }
      // Model deletion is never required: obsolete facts remain in the archive.
    }
    if (!this.saveRows(rows)) throw new Error(this.lastError || '保存剧情记忆失败');
    return this.getAllRows();
  }

  /** Retain named cards after departure; never infer a name from narrative prose. */
  syncCharacterRecords(status, { turnId = '' } = {}) {
    const rows = this.getAllRows();
    const cards = [];
    const readCards = (text, present) => {
      let card = null;
      for (const line of String(text || '').split(/\r?\n/)) {
        const nameMatch = line.match(/^\s*(?:\d+[.、]\s*)?\[([^|\]\n]+)\|/) || line.match(/^\s*(?:姓名|名字)[：:]\s*(\S.*)$/);
        if (nameMatch) {
          if (card) cards.push(card);
          card = { name: nameMatch[1].trim(), profile: line.trim(), present };
        } else if (card) card.profile += `\n${line}`;
      }
      if (card) cards.push(card);
    };
    readCards(status?.characters, '是');
    readCards(status?.surroundings, '是');
    readCards(status?.characterRecords, '未确认');
    const presentNames = new Set(cards.filter(card => card.present === '是').map(card => card.name));
    // A full current status with named cards or an explicit absence can confirm departure.
    const hasPresence = presentNames.size > 0 || /^(?:无|暂无|无人|无人在场|暂无在场角色)[。\s]*$/.test(String(status?.characters || '').trim());
    if (hasPresence) for (const row of rows) {
      if (row.table_id === 'character_archive' && !protectedRow(row) && !presentNames.has(row.row_data?.name)) row.row_data.present = '否';
    }
    for (const card of cards) {
      if (!card.name || /^(?:未知|未记录|无)$/.test(card.name)) continue;
      const data = {
        name: card.name, profile: card.profile.trim(), present: card.present,
        ...(card.present === '是' && status?.time ? { last_seen: status.time } : {}),
        ...(card.present === '是' && status?.location ? { location: status.location } : {}),
      };
      const target = rows.find(row => row.table_id === 'character_archive' && row.row_data?.name === card.name);
      if (target) {
        if (protectedRow(target)) continue;
        // Historical records must not change the current presence supplied by a live card.
        if (card.present !== '是' && presentNames.has(card.name)) continue;
        if (card.present !== '是') data.present = target.row_data?.present || '未确认';
        patchCharacterRow(target, data);
      } else rows.push(this.makeRow({ table_id: 'character_archive', row_data: data, source_turn_id: turnId }));
    }
    if (!this.saveRows(rows)) throw new Error(this.lastError || '保存角色记录失败');
    return this.getRowsByTable('character_archive');
  }

  clearAll() { return this.saveRows([], { rebalance: false }); }
}

let memoryStoreInstance;
export const getMemoryStore = () => (memoryStoreInstance ||= new MemoryStore());
