const STORAGE_KEY = 'rpg_status_bar';

export const STATUS_FIELDS = [
  { id: 'world', label: '当前世界' },
  { id: 'worldInfo', label: '世界概况', multiline: true },
  { id: 'time', label: '时间' },
  { id: 'location', label: '地点' },
  { id: 'weather', label: '天气' },
  { id: 'user', label: 'User状态', multiline: true },
  { id: 'characters', label: '在场主要角色状态', multiline: true },
  { id: 'surroundings', label: '周围的人', multiline: true },
  { id: 'extra', label: '其他/异常状态', multiline: true },
  { id: 'characterRecords', label: '角色记录', multiline: true },
];

export const EMPTY_STATUS = Object.freeze(Object.fromEntries(STATUS_FIELDS.map(({ id }) => [id, ''])));

/** Status updates are string-valued patches. Null/arrays/objects never erase a field. */
export function validateStatusPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(STATUS_FIELDS
    .filter(({ id }) => Object.hasOwn(value, id) && typeof value[id] === 'string')
    .map(({ id }) => [id, value[id]]));
}

export class StatusStore {
  constructor() {
    this.lastError = '';
    this.status = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return { ...EMPTY_STATUS, ...validateStatusPatch(stored ? JSON.parse(stored) : {}) };
    } catch (error) {
      this.lastError = `加载状态栏失败：${error.message}`;
      return { ...EMPTY_STATUS };
    }
  }

  save(patch, { replace = false } = {}) {
    const next = { ...(replace ? EMPTY_STATUS : this.status), ...validateStatusPatch(patch) };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      this.status = next;
      this.lastError = '';
      return true;
    } catch (error) {
      this.lastError = `保存状态栏失败：${error.message}`;
      return false;
    }
  }

  replace(status) { return this.save(status, { replace: true }); }
  get() { return { ...this.status }; }
  getLastError() { return this.lastError; }

  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      this.status = { ...EMPTY_STATUS };
      this.lastError = '';
      return true;
    } catch (error) {
      this.lastError = `清空状态栏失败：${error.message}`;
      return false;
    }
  }

  hasContent() { return Object.values(this.status).some(value => value.trim()); }
}

let statusStoreInstance;
export const getStatusStore = () => (statusStoreInstance ||= new StatusStore());

/** Complete display, also used for context injection. Unknown values are explicit. */
export function renderStatusText(status) {
  const values = { ...EMPTY_STATUS, ...validateStatusPatch(status) };
  const value = key => values[key].trim() || '未记录';
  return [
    '♦常规状态',
    `当前世界：${value('world')}`, `世界概况：${value('worldInfo')}`,
    `时间：${value('time')}`, `地点：${value('location')}`, `天气：${value('weather')}`,
    `♦User状态\n${value('user')}`,
    `♦在场主要角色状态\n${value('characters')}`,
    `♦周围的人\n${value('surroundings')}`,
    `♦其他/异常状态\n${value('extra')}`,
    `🔍角色记录\n${value('characterRecords')}`,
  ].join('\n');
}
