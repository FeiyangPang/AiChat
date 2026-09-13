import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, MEMORY_MIGRATION_BACKUP_KEY } from '../src/utils/memory/memory-store.js';
import { StatusStore, renderStatusText } from '../src/utils/memory/status-store.js';
import { extractStatusEdit } from '../src/utils/memory/status-edit-parser.js';
import { parseTableEditActions, extractTableEditBlocks } from '../src/utils/memory/memory-edit-parser.js';

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    clear: () => data.clear(),
  };
  return data;
}
function story(index) {
  return { id: `story_${index}`, table_id: 'story_summary', row_data: { time: `日${index}`, plot: `事件${index}`, promise: `约定${index}` }, created_at: index, updated_at: index };
}
function originals(rows) { return rows.flatMap(row => row.source_rows?.length ? originals(row.source_rows) : [row]); }

test('75 turns retain every original fact across 8 recent, 5 fixed batches and historical archive', () => {
  storage();
  const store = new MemoryStore();
  for (let index = 1; index <= 75; index++) assert.equal(store.saveRows([...store.getAllRows(), story(index)]), true);
  assert.equal(store.getRowsByTable('story_summary').length, 8);
  assert.equal(store.getRowsByTable('long_term').length, 5);
  assert.ok(store.getRowsByTable('archive').length > 0);
  const all = originals(store.getAllRows()).sort((a, b) => a.created_at - b.created_at);
  assert.deepEqual(all.map(row => row.row_data), Array.from({ length: 75 }, (_, index) => story(index + 1).row_data));
  for (const row of store.getAllRows().filter(row => row.source_rows)) assert.ok(row.source_rows.length <= 8);
  assert.ok(store.getInjectableRows().every(row => row.table_id !== 'archive'));
  const restored = new MemoryStore();
  assert.deepEqual(restored.getAllRows(), store.getAllRows());
});

test('version upgrade backs up exact storage and retains custom template and original rows', () => {
  const oldTemplate = { meta: { version: '2.0.0' }, tables: [{ id: 'custom', columns: [{ id: 'secret', name: '设定' }] }] };
  const oldRows = [...Array.from({ length: 19 }, (_, index) => story(index + 1)), { id: 'custom1', table_id: 'custom', row_data: { secret: '山门口令' } }];
  const data = storage({ rpg_memory_template: JSON.stringify(oldTemplate), rpg_memory_rows: JSON.stringify(oldRows) });
  const store = new MemoryStore();
  const backup = JSON.parse(data.get(MEMORY_MIGRATION_BACKUP_KEY));
  assert.equal(backup.template, JSON.stringify(oldTemplate));
  assert.equal(backup.rows, JSON.stringify(oldRows));
  assert.ok(store.getTemplate().tables.some(table => table.id === 'custom'));
  assert.deepEqual(new Set(originals(store.getAllRows()).map(row => row.id)), new Set(oldRows.map(row => row.id)));
});

test('user core/pinned data survives overflow and model cannot create, modify, or delete it', () => {
  storage();
  const store = new MemoryStore();
  const pinned = store.createRow({ table_id: 'story_summary', is_pinned: true, row_data: { plot: '用户承诺' } });
  assert.equal(pinned.table_id, 'core');
  store.applyMemoryEdits([
    { action: 'insert', tableId: 'core', data: { plot: '模型擅自锁定' } },
    { action: 'update', tableId: 'story_summary', rowId: pinned.id, data: { plot: '覆盖' } },
    { action: 'delete', tableId: 'core', rowIndex: 0 },
  ], { core: [pinned.id] }, ['core'], { turnId: 'turn1' });
  store.saveRows([...store.getAllRows(), ...Array.from({ length: 80 }, (_, index) => story(index))]);
  assert.deepEqual(store.getRowsByTable('core'), [pinned]);
  const lockedCharacter = store.createRow({ table_id: 'character_archive', is_pinned: true, row_data: { name: '小林', profile: '锁定身份' } });
  store.applyMemoryEdits([{ action: 'update', tableId: 'character_archive', rowId: lockedCharacter.id, data: { profile: '错误身份' } }]);
  assert.equal(store.getRowsByTable('character_archive')[0].row_data.profile, '锁定身份');
});

test('JSON arrays and repeated blocks apply once, including retry after rows enter long-term memory', () => {
  storage();
  const store = new MemoryStore();
  const action = { action: 'insert', tableId: 'story_summary', data: { plot: '捡到钥匙' } };
  const protocol = `<tableEdit>${JSON.stringify([action, action], null, 2)}</tableEdit>`;
  const actions = extractTableEditBlocks(protocol + protocol).actions;
  assert.equal(actions.length, 1);
  store.applyMemoryEdits(actions, {}, [], { turnId: 'same-turn' });
  store.saveRows([...store.getAllRows(), ...Array.from({ length: 20 }, (_, index) => ({ ...story(index), created_at: Date.now() + index + 1 }))]);
  store.applyMemoryEdits(actions, {}, [], { turnId: 'same-turn' });
  assert.equal(originals(store.getAllRows()).filter(row => row.row_data.plot === '捡到钥匙').length, 1);
});

test('status JSON patches preserve missing values, reject invalid types, and restore snapshots explicitly', () => {
  storage();
  const store = new StatusStore();
  store.save({ world: '都市', time: '下午', characters: '小林' });
  const snapshot = store.get();
  const patch = extractStatusEdit('继续。<statusEdit>{"time":"傍晚","world":null,"characters":["错误"]}</statusEdit>');
  assert.deepEqual(patch.status, { time: '傍晚' });
  store.save(patch.status);
  assert.equal(store.get().world, '都市');
  assert.equal(store.get().characters, '小林');
  assert.equal(extractStatusEdit('<statusEdit>{"time":"坏JSON",}</statusEdit>').status, null);
  assert.equal(extractStatusEdit('<statusEdit>{"time":"未完成"}').status, null);
  assert.equal(extractStatusEdit('<statusEdit>{"current_world_wrong":"误匹配"}</statusEdit>').status, null);
  store.save({ weather: '小雨' });
  store.replace(snapshot);
  assert.equal(store.get().weather, '');
  assert.match(renderStatusText({ world: '都市' }), /世界概况：未记录/);
  assert.match(renderStatusText({ world: '都市' }), /♦周围的人\n未记录/);
});

test('legacy Chinese footer separates world fields and nested character fields', () => {
  const response = '门铃响了。\n<details>\n<summary>后置状态栏</summary>\n```Python\n♦常规状态\n当前世界：现代都市\n世界概况：沿海城市\n时间：15:30\n地点：咖啡馆\n天气：小雨\n♦User状态\n姓名：玩家\n位置：靠窗\n♦在场主要角色状态\n1.[林雨晴|24岁|作家]\n异常状态：无\n位置：桌边\n♦周围的人\n姓名：服务员\n位置：吧台\n📑剧情记忆: [当前数量: 0/8]\n📚长期剧情记忆: [当前数量: 0/5]\n💎核心剧情记忆: [当前数量: 0]\n🔍角色记录:[0]\n```\n</details>';
  const { text, status } = extractStatusEdit(response);
  assert.equal(text, '门铃响了。');
  assert.equal(status.world, '现代都市');
  assert.equal(status.worldInfo, '沿海城市');
  assert.equal(status.location, '咖啡馆');
  assert.match(status.user, /位置：靠窗/);
  assert.match(status.characters, /异常状态：无\n位置：桌边/);
  assert.match(status.surroundings, /姓名：服务员\n位置：吧台/);
  assert.ok(!status.extra);
  assert.ok(!status.surroundings.includes('剧情记忆'));
});

test('known characters remain available when they leave and profile changes preserve history', () => {
  storage();
  const store = new MemoryStore();
  store.syncCharacterRecords({ time: '15:30', location: '咖啡馆', characters: '1.[林雨晴|24岁|作家]\n随身物品：笔记本' }, { turnId: '1' });
  store.syncCharacterRecords({ time: '16:00', location: '街口', characters: '无', surroundings: '无', characterRecords: '1.[林雨晴|24岁|作家]\n随身物品：笔记本' }, { turnId: '2' });
  assert.equal(store.getRowsByTable('character_archive')[0].row_data.present, '否');
  assert.equal(store.getRowsByTable('character_archive')[0].row_data.last_seen, '15:30');
  store.syncCharacterRecords({ time: '17:00', location: '书店', characters: '1.[林雨晴|24岁|作家]\n随身物品：新书' }, { turnId: '3' });
  const row = store.getRowsByTable('character_archive')[0];
  assert.equal(row.row_data.present, '是');
  assert.equal(row.row_data.last_seen, '17:00');
  assert.match(row.profile_history[0], /笔记本/);
});

test('partial character cards retain identity, background and clothing while explicit field changes replace old facts', () => {
  storage();
  const store = new MemoryStore();
  const original = '1.[林雨晴|24岁|上海|作家]\n背景：在上海长大，喜欢写小说\n衣着：灰色开衫\n随身物品：笔记本\n位置&姿势：坐在窗边';
  store.syncCharacterRecords({ time: '15:30', location: '咖啡馆', characters: original });
  store.syncCharacterRecords({ time: '16:00', location: '书店', characters: '姓名：林雨晴\n位置&姿势：站在书架前\n随身物品：无' });
  let row = store.getRowsByTable('character_archive')[0];
  assert.match(row.row_data.profile, /\[林雨晴\|24岁\|上海\|作家\]/);
  assert.match(row.row_data.profile, /背景：在上海长大，喜欢写小说/);
  assert.match(row.row_data.profile, /衣着：灰色开衫/);
  assert.match(row.row_data.profile, /位置&姿势：站在书架前/);
  assert.match(row.row_data.profile, /随身物品：无/);
  assert.ok(!row.row_data.profile.includes('坐在窗边'));
  assert.equal(row.row_data.location, '书店');
  assert.equal(row.row_data.present, '是');
  store.syncCharacterRecords({ time: '16:10', characters: '姓名：林雨晴\n衣饰：蓝色外套\n背景：未记录' });
  row = store.getRowsByTable('character_archive')[0];
  assert.match(row.row_data.profile, /衣饰：蓝色外套/);
  assert.ok(!row.row_data.profile.includes('灰色开衫'));
  assert.match(row.row_data.profile, /背景：在上海长大，喜欢写小说/);
  assert.equal(row.row_data.location, '书店');
  assert.ok(row.profile_history.includes(original));
  const auditLength = row.profile_history.length;
  store.syncCharacterRecords({ time: '16:10', characters: '姓名：林雨晴\n衣饰：蓝色外套\n背景：未记录' });
  assert.equal(store.getRowsByTable('character_archive')[0].profile_history.length, auditLength);
});

test('tableEdit character patches use the same stable fact merge and retain the audit version', () => {
  storage();
  const store = new MemoryStore();
  const initial = store.createRow({ table_id: 'character_archive', row_data: { name: '小林', profile: '身份：小说作者\n背景：曾在书店工作\n衣着：白色衬衫', present: '否', location: '书店' } });
  store.applyMemoryEdits([{ action: 'update', tableId: 'character_archive', rowId: initial.id, data: { profile: '衣着：蓝色衬衫' } }]);
  const row = store.getRowsByTable('character_archive')[0];
  assert.equal(row.row_data.profile, '身份：小说作者\n背景：曾在书店工作\n衣着：蓝色衬衫');
  assert.equal(row.row_data.present, '否');
  assert.equal(row.row_data.location, '书店');
  assert.deepEqual(row.profile_history, [initial.row_data.profile]);
});

test('storage failures do not mutate live memory/status and model commits surface errors', () => {
  storage();
  const memory = new MemoryStore();
  const status = new StatusStore();
  memory.createRow({ row_data: { plot: '已有事实' } });
  status.save({ time: '正午' });
  const before = memory.getAllRows();
  localStorage.setItem = () => { throw new Error('quota exceeded'); };
  assert.equal(memory.createRow({ row_data: { plot: '不能保存' } }), null);
  assert.deepEqual(memory.getAllRows(), before);
  assert.equal(status.save({ time: '下午' }), false);
  assert.equal(status.get().time, '正午');
  assert.throws(() => memory.applyMemoryEdits([{ action: 'insert', tableId: 'story_summary', data: { plot: '失败' } }]), /quota exceeded/);
});

test('legacy function syntax is parsed as data and malformed JSON is not partially executed', () => {
  const actions = parseTableEditActions('insertRow(0, {"plot":"他说：你好（今天）","time":"傍晚"})');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].data.plot, '他说：你好（今天）');
  assert.deepEqual(parseTableEditActions('[{"action":"insert","tableId":"story_summary","data":{"plot":"错误"}}'), []);
  assert.deepEqual(parseTableEditActions('insertRow(0, dangerousFunction())'), []);
  assert.deepEqual(parseTableEditActions('insertRow(-1, {"plot":"错误"})'), []);
  assert.equal(parseTableEditActions('{"action":"insert","tableId":"story_summary","data":{"plot":"第一条"}}\n{"action":"insert","tableId":"story_summary","data":{"plot":"第二条"}}').length, 2);
});

test('manually edited long-term batches are sealed before the next automatic merge', () => {
  storage();
  const store = new MemoryStore();
  store.saveRows(Array.from({ length: 9 }, (_, index) => story(index + 1)));
  const batch = store.getRowsByTable('long_term')[0];
  store.updateRow(batch.id, { row_data: { ...batch.row_data, plot: '用户补充的重要事实' } });
  store.saveRows([...store.getAllRows(), story(10)]);
  assert.equal(store.getRowsByTable('long_term').find(row => row.id === batch.id).row_data.plot, '用户补充的重要事实');
  assert.equal(store.getRowsByTable('long_term').length, 2);
  assert.equal(store.getRowsByTable('long_term').find(row => row.id === batch.id).source_rows[0].row_data.plot, '事件1');
});
