import { validateStatusPatch } from './status-store.js';

const KEY_MAP = {
  world: ['当前世界', '世界', 'world'],
  worldInfo: ['世界概况', '世界简介', 'worldinfo'],
  time: ['时间', 'time'],
  location: ['地点', '位置', 'location'],
  weather: ['天气', 'weather'],
  user: ['user状态', '用户状态', '玩家状态', 'user'],
  characters: ['在场主要角色状态', '在场角色', '角色状态', 'characters'],
  surroundings: ['周围的人', '周围', 'surroundings'],
  extra: ['其他/异常状态', '其他', '异常状态', '备注', 'extra'],
  characterRecords: ['角色记录', 'characterrecords'],
};
const richKeys = new Set(['user', 'characters', 'surroundings', 'extra', 'characterRecords']);
const normalizeLabel = label => String(label || '').trim().toLowerCase().replace(/^[♦◆🔍\s]+/u, '').replace(/\s/g, '');
const resolveKey = label => Object.keys(KEY_MAP).find(key => KEY_MAP[key].includes(normalizeLabel(label))) || null;
const statusTag = () => /<statusEdit\b[^>]*>([\s\S]*?)<\/statusEdit\s*>/gi;
const legacyDetails = () => /<details\b[^>]*>\s*<summary\b[^>]*>\s*后置状态栏\s*<\/summary\s*>([\s\S]*?)<\/details\s*>/gi;
const legacyFence = () => /```(?:python|text|txt)?\s*\r?\n([\s\S]*?)```/gi;
const isLegacyStatus = content => /(?:^|\n)\s*♦常规状态\s*(?:\n|$)/u.test(content);

export const stripStatusEditBlocks = text => {
  let out = String(text ?? '').replace(statusTag(), '').replace(legacyDetails(), '');
  // Incomplete protocol blocks are hidden while streaming, never parsed or applied.
  out = out.replace(/<statusEdit\b[^>]*>[\s\S]*$/i, '');
  out = out.replace(/<details\b[^>]*>\s*<summary\b[^>]*>\s*后置状态栏\s*<\/summary\s*>[\s\S]*$/i, '');
  out = out.replace(legacyFence(), (block, content) => isLegacyStatus(content) ? '' : block);
  return out.replace(/\n{3,}/g, '\n\n').trim();
};

export const extractStatusEdit = text => {
  const raw = String(text ?? '');
  const explicit = [...raw.matchAll(statusTag())];
  let status = null;
  if (explicit.length) {
    status = parseStatusBlock(explicit.at(-1)[1]);
  } else if (!/<statusEdit\b/i.test(raw)) {
    const details = [...raw.matchAll(legacyDetails())];
    if (details.length) status = parseStatusBlock(details.at(-1)[1]);
    else {
      const fences = [...raw.matchAll(legacyFence())].filter(match => isLegacyStatus(match[1]));
      if (fences.length) status = parseStatusBlock(fences.at(-1)[1]);
    }
  }
  return { text: stripStatusEditBlocks(raw), status };
};

/** Parse data only: neither Python nor function-like content is executed. */
export function parseStatusBlock(content) {
  let cleaned = String(content ?? '').trim();
  const fence = cleaned.match(/^```(?:json|python|text|txt)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  if (fence) cleaned = fence[1].trim();
  if (!cleaned) return null;
  if (/^[\[{]/.test(cleaned)) {
    try {
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const mapped = {};
      for (const [label, value] of Object.entries(parsed)) {
        const key = resolveKey(label);
        if (key && typeof value === 'string') mapped[key] = value;
      }
      const status = validateStatusPatch(mapped);
      return Object.keys(status).length ? status : null;
    } catch { return null; }
  }

  const result = {};
  let currentKey = null;
  let section = 'general';
  for (const original of cleaned.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || /^```/.test(line)) continue;
    if (/^[♦◆]?\s*常规状态\s*[：:]?$/u.test(line)) {
      section = 'general'; currentKey = null; continue;
    }
    if (/^(?:📑|📚|💎)?\s*(?:长期剧情记忆|核心剧情记忆|剧情记忆)\s*[：:]/u.test(line)) {
      section = 'memory'; currentKey = null; continue;
    }
    const heading = line.match(/^([♦◆🔍]?\s*[^：:]+?)(?:[：:]\s*(.*))?$/u);
    const headingKey = heading ? resolveKey(heading[1]) : null;
    // Nested character fields such as 异常状态 or 地点 remain in their own card.
    const explicitHeading = /^[♦◆🔍]/u.test(line);
    if (headingKey && richKeys.has(headingKey) && (explicitHeading || !heading[2] && !line.includes('：') && !line.includes(':') || section === 'general')) {
      currentKey = headingKey;
      section = headingKey;
      const initial = heading[2] || '';
      result[currentKey] = currentKey === 'characterRecords' && /^\[\s*\d+\s*\]$/.test(initial) ? '' : initial;
      continue;
    }
    if (section === 'memory') continue;
    const pair = line.match(/^([^：:]{1,30})[：:]\s*(.*)$/);
    const key = pair ? resolveKey(pair[1]) : null;
    if (section === 'general' && key) {
      currentKey = key;
      result[key] = pair[2];
    } else if (currentKey) {
      result[currentKey] = [result[currentKey], line].filter(Boolean).join('\n');
    }
  }
  return Object.keys(result).length ? result : null;
}
