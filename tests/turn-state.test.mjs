import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStore } from '../src/utils/memory/memory-store.js'
import { StatusStore } from '../src/utils/memory/status-store.js'
import { applyTurnResponse, captureTurnState, restoreTurnState } from '../src/utils/memory/turn-state.js'
import { saveGameSession, loadGameSession } from '../src/utils/game-session.js'
import { buildStoryPrompt } from '../src/utils/story-prompt.js'

function storage() {
  const data = new Map()
  globalThis.localStorage = { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }
}
const response = (plot = '雨晴递出草稿，约定下周讨论。') => `她把笔记本递到你面前。\n<statusEdit>${JSON.stringify({ location: '咖啡馆门口', characters: '[林雨晴|24|撰稿人]\n随身物品：钢笔', extra: '护符：防雨，剩余一小时' })}</statusEdit>\n<tableEdit>${JSON.stringify([{ action: 'insert', tableId: 'story_summary', data: { plot, characters: '林雨晴', location: '咖啡馆门口' } }])}</tableEdit>`
const stores = () => { storage(); return { memoryStore: new MemoryStore(), statusStore: new StatusStore() } }

test('accepted turn produces visible snapshot and can fully undo tier rotation and characters', () => {
  const pair = stores()
  for (let i = 0; i < 8; i++) pair.memoryStore.createRow({ table_id: 'story_summary', row_data: { plot: `事件${i}` } })
  pair.statusStore.save({ location: '靠窗座位', weather: '雨' })
  const before = captureTurnState(pair.memoryStore, pair.statusStore)
  const result = applyTurnResponse({ ...pair, response: response(), turnId: 'turn-9' })
  assert.equal(result.content, '她把笔记本递到你面前。')
  assert.equal(result.status.location, '咖啡馆门口')
  assert.equal(result.status.weather, '雨')
  assert.equal(result.memories.filter(row => row.table_id === 'story_summary').length, 8)
  assert.equal(result.memories.filter(row => row.table_id === 'long_term').length, 1)
  assert.equal(result.memories.filter(row => row.table_id === 'character_archive').length, 1)
  restoreTurnState(result.before, pair.memoryStore, pair.statusStore)
  assert.deepEqual(captureTurnState(pair.memoryStore, pair.statusStore), before)
  assert.equal(result.status.location, '咖啡馆门口', 'historical snapshot remains immutable')
})

test('missing or malformed block never commits partial memory/state', () => {
  const pair = stores()
  pair.statusStore.save({ location: '原地' })
  const before = captureTurnState(pair.memoryStore, pair.statusStore)
  for (const raw of ['雨还在下。', '雨还在下。<statusEdit>{"location":"室外"}</statusEdit>', '雨还在下。<statusEdit>{"location":']) {
    const reply = applyTurnResponse({ ...pair, response: raw, turnId: 'broken' })
    assert.ok(reply.warning)
    assert.equal(reply.content, '雨还在下。')
    assert.deepEqual(captureTurnState(pair.memoryStore, pair.statusStore), before)
  }
})

test('a failed memory write rolls the status back', () => {
  const pair = stores()
  pair.statusStore.save({ location: '原地' })
  const before = captureTurnState(pair.memoryStore, pair.statusStore)
  const original = localStorage.setItem
  let fail = true
  localStorage.setItem = (key, value) => {
    if (key === 'rpg_memory_rows' && fail) { fail = false; throw new Error('quota') }
    original(key, value)
  }
  assert.throws(() => applyTurnResponse({ ...pair, response: response(), turnId: 'quota' }), /保存记忆失败/)
  assert.deepEqual(captureTurnState(pair.memoryStore, pair.statusStore), before)
})

test('snapshot reload keeps narrative, metadata and memory together without API credentials', () => {
  const pair = stores()
  const reply = applyTurnResponse({ ...pair, response: response(), turnId: 'saved' })
  const session = { gameStarted: true, worldBook: '城市', role: { name: '用户' }, messages: [reply], snapshot: captureTurnState(pair.memoryStore, pair.statusStore) }
  assert.equal(saveGameSession(session), true)
  const loaded = loadGameSession()
  assert.deepEqual(loaded.snapshot, session.snapshot)
  assert.equal(loaded.messages[0].content, reply.content)
  assert.equal('apiKey' in loaded, false)
})

test('prompt retains full worldbook, all core facts and excludes unrelated cold archives', () => {
  const pair = stores()
  pair.memoryStore.createRow({ table_id: 'core', row_data: { plot: '不能遗忘的约定'.repeat(800) } })
  pair.memoryStore.createRow({ table_id: 'archive', row_data: { plot: '无关往事' } })
  const book = '世界设定'.repeat(1000) + '书末关键规则'
  const built = buildStoryPrompt({ ...pair, worldBook: book, role: { name: '玩家' } })
  assert.ok(built.prompt.includes('书末关键规则'))
  assert.ok(built.prompt.includes('不能遗忘的约定'.repeat(800)))
  assert.ok(!built.prompt.includes('无关往事'))
})

test('Chinese archive recall recognizes character names inside a normal action', () => {
  const pair = stores()
  pair.memoryStore.createRow({ table_id: 'archive', row_data: { plot: '林雨晴把笔记本交给你，约定周末讨论。' } })
  const built = buildStoryPrompt({ ...pair, worldBook: '都市', role: { name: '用户' }, query: '把笔记本还给林雨晴' })
  assert.ok(built.prompt.includes('约定周末讨论'))
})

test('invalid saved snapshot cannot clear current valid memories', () => {
  const pair = stores()
  pair.statusStore.save({ location: '保留这里' })
  pair.memoryStore.createRow({ table_id: 'core', row_data: { plot: '保留约定' } })
  const before = captureTurnState(pair.memoryStore, pair.statusStore)
  localStorage.setItem('rpg_game_session_v1', JSON.stringify({ version: 1, messages: [], snapshot: { rows: [], status: null } }))
  assert.equal(loadGameSession(), null)
  assert.ok(localStorage.getItem('rpg_invalid_session_backup_v1'))
  assert.throws(() => restoreTurnState({ rows: [], status: null }, pair.memoryStore, pair.statusStore), /快照无效/)
  assert.deepEqual(captureTurnState(pair.memoryStore, pair.statusStore), before)
})

test('persistent failure in memory storage still rolls back the changed status', () => {
  const pair = stores()
  pair.statusStore.save({ location: '原地' })
  const before = captureTurnState(pair.memoryStore, pair.statusStore)
  const original = localStorage.setItem
  localStorage.setItem = (key, value) => {
    if (key === 'rpg_memory_rows') throw new Error('persistent quota')
    original(key, value)
  }
  assert.throws(() => applyTurnResponse({ ...pair, response: response(), turnId: 'persistent-quota' }), /保存记忆失败/)
  assert.deepEqual(captureTurnState(pair.memoryStore, pair.statusStore), before)
})
