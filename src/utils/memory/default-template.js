const storyColumns = [
  { id: 'time', name: '时间', type: 'text' },
  { id: 'location', name: '地点', type: 'text' },
  { id: 'characters', name: '出场角色', type: 'text' },
  { id: 'plot', name: '剧情', type: 'multiline' },
  { id: 'tone', name: '氛围', type: 'text' },
];

const makeTable = (id, name, note, columns = storyColumns) => ({
  id, name, scope: 'global',
  sourceData: { note, initNode: '', insertNode: '', updateNode: '', deleteNode: '' },
  updateConfig: { contextDepth: 8, updateFrequency: 1, batchSize: 8, skipFloors: 0 },
  exportConfig: { enabled: false, splitByRow: false, entryName: '', keywords: '', injectionTemplate: '' },
  columns: columns.map(column => ({ ...column })),
});

export const DEFAULT_MEMORY_TEMPLATE = {
  meta: {
    id: 'rpg-default-v4', name: '分层剧情记忆', version: '4.0.0', author: '官方',
    description: '最近8条剧情、5批长期记忆、用户锁定的核心记忆、角色记录，以及可查阅的完整归档。',
    tags: ['角色扮演', '游戏', '分层记忆'],
  },
  tables: [
    makeTable('story_summary', '剧情记忆', '每轮新增一条已发生事件，包含时间、地点、人物、变化与未完成约定。最近8条自动保留；溢出内容由程序无损合并到长期记忆。模型不得删除旧剧情。'),
    makeTable('long_term', '长期剧情记忆', '由程序将较早剧情按8条一批无损整理，保留最近5批。模型只读。'),
    makeTable('core', '核心剧情记忆', '仅由用户明确锁定；持续保留，不自动覆盖、降级或删除。模型只读。'),
    makeTable('character_archive', '角色记录', '记录已知人物及最后出现的信息；人物离场后仍保留记录。', [
      { id: 'name', name: '姓名', type: 'text' },
      { id: 'profile', name: '角色档案', type: 'multiline' },
      { id: 'last_seen', name: '最后出现时间', type: 'text' },
      { id: 'location', name: '最后出现地点', type: 'text' },
      { id: 'present', name: '当前在场', type: 'text' },
    ]),
    makeTable('archive', '历史归档', '长期记忆超限后移入此处，保留原始记录供用户查阅；不自动注入模型上下文。'),
  ],
  injection: { template: '{{tableData}}', position: 'system_end', wrapper: '<memories>\n{{tableData}}\n</memories>' },
};
