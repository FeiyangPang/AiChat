export const stripTableEditBlocks = (text) => {
  let out = String(text ?? '');
  const startRe = /<tableEdit\b[^>]*>/i;
  const endRe = /<\/tableEdit\s*>/i;
  for (let i = 0; i < 20; i++) {
    const start = out.match(startRe);
    if (!start) break;
    const startIdx = start.index ?? -1;
    if (startIdx < 0) break;
    const afterStart = out.slice(startIdx + start[0].length);
    const end = afterStart.match(endRe);
    if (!end) {
      out = out.slice(0, startIdx);
      break;
    }
    const endIdx = startIdx + start[0].length + (end.index ?? 0);
    out = out.slice(0, startIdx) + out.slice(endIdx + end[0].length);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
};

export const extractTableEditBlocks = (text) => {
  const raw = String(text ?? '');
  const re = /<tableEdit\b[^>]*>([\s\S]*?)<\/tableEdit\s*>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(raw))) blocks.push(m[1]);
  if (!blocks.length) return { text: stripTableEditBlocks(raw), blocks: [], actions: [] };
  const stripped = raw.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();
  const actions = [];
  for (const block of blocks) {
    actions.push(...parseTableEditActions(block));
  }
  return { text: stripTableEditBlocks(stripped), blocks, actions: dedupeActions(actions) };
};

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const stableKey = value => value && typeof value === 'object'
  ? JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, stableKey(value[key])])))
  : JSON.stringify(value);
const dedupeActions = actions => [...new Map(actions.map(action => [stableKey(action), action])).values()];

export const parseTableEditActions = (content) => {
  const cleaned = String(content ?? '').replace(/<!--([\s\S]*?)-->/g, '$1').trim()
    .replace(/^```(?:json|javascript|js)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i, '$1').trim();
  if (!cleaned) return [];
  const actions = [];
  const pushAction = (raw) => {
    if (!isObject(raw)) return;
    const action = String(raw.action || raw.type || '').trim().toLowerCase();
    if (!['insert', 'update', 'delete', 'init'].includes(action)) return;
    const data = raw.data ?? raw.row_data ?? raw.rowData ?? raw.values;
    if (action !== 'delete' && !isObject(data)) return;
    actions.push({
      action,
      tableId: raw.table_id ?? raw.tableId ?? raw.table,
      tableIndex: raw.table_index ?? raw.tableIndex,
      tableName: raw.table_name ?? raw.tableName,
      rowId: raw.row_id ?? raw.rowId ?? raw.id,
      rowIndex: raw.row_index ?? raw.rowIndex ?? raw.index,
      data,
    });
  };
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const parseArgValue = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      const parsed = tryParse(text);
      return parsed == null ? null : parsed;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    return text;
  };
  const parseIndex = (value) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    if (typeof value !== 'string') return null;
    const raw = value.trim().replace(/^['"]|['"]$/g, '');
    if (/^\d+$/.test(raw)) return Number(raw);
    return null;
  };
  const splitFunctionArgs = (raw) => {
    const text = String(raw || '');
    const args = [];
    let buf = '';
    let depthParen = 0;
    let depthBrace = 0;
    let depthBracket = 0;
    let inString = false;
    let quote = '';
    let escape = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        buf += ch;
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === quote) {
          inString = false;
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        buf += ch;
        continue;
      }
      if (ch === '{') {
        depthBrace += 1;
        buf += ch;
        continue;
      }
      if (ch === '}') {
        depthBrace = Math.max(0, depthBrace - 1);
        buf += ch;
        continue;
      }
      if (ch === '[') {
        depthBracket += 1;
        buf += ch;
        continue;
      }
      if (ch === ']') {
        depthBracket = Math.max(0, depthBracket - 1);
        buf += ch;
        continue;
      }
      if (ch === '(') {
        depthParen += 1;
        buf += ch;
        continue;
      }
      if (ch === ')') {
        depthParen = Math.max(0, depthParen - 1);
        buf += ch;
        continue;
      }
      if (ch === ',' && depthBrace === 0 && depthBracket === 0 && depthParen === 0) {
        args.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) args.push(buf.trim());
    return args;
  };
  const findMatchingParen = (text, openIdx) => {
    let depth = 0;
    let inString = false;
    let quote = '';
    let escape = false;
    for (let i = openIdx; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === quote) {
          inString = false;
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }
      if (ch === '(') {
        depth += 1;
        continue;
      }
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  };
  const parseFunctionActions = (text) => {
    const source = String(text || '');
    const out = [];
    const re = /(insertRow|updateRow|deleteRow)\s*\(/gi;
    let match;
    while ((match = re.exec(source))) {
      const name = String(match[1] || '').toLowerCase();
      const openIdx = source.indexOf('(', match.index);
      if (openIdx < 0) continue;
      const closeIdx = findMatchingParen(source, openIdx);
      if (closeIdx < 0) continue;
      const args = splitFunctionArgs(source.slice(openIdx + 1, closeIdx));
      const values = args.map(parseArgValue);
      const tableIndex = parseIndex(values[0]);
      if (tableIndex == null) {
        re.lastIndex = closeIdx + 1;
        continue;
      }
      if (name === 'insertrow') {
        const data = values[1];
        if (isObject(data)) {
          out.push({ action: 'insert', tableIndex, data });
        }
      } else if (name === 'updaterow') {
        const rowIndex = parseIndex(values[1]);
        const data = values[2];
        if (rowIndex != null && isObject(data)) {
          out.push({ action: 'update', tableIndex, rowIndex, data });
        }
      } else if (name === 'deleterow') {
        const rowIndex = parseIndex(values[1]);
        if (rowIndex != null) {
          out.push({ action: 'delete', tableIndex, rowIndex });
        }
      }
      re.lastIndex = closeIdx + 1;
    }
    return out;
  };
  // Parse a complete JSON document once. Never recover fragments from malformed JSON.
  if (/^[\[{]/.test(cleaned)) {
    const parsed = tryParse(cleaned);
    if (Array.isArray(parsed)) parsed.forEach(pushAction);
    else if (isObject(parsed)) pushAction(parsed);
    else {
      const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const records = lines.map(line => tryParse(line));
      if (records.length < 2 || !records.every(isObject)) return [];
      records.forEach(pushAction);
    }
    return dedupeActions(actions);
  }
  const lineItems = cleaned
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  for (const line of lineItems) {
    const normalized = line.replace(/,$/, '');
    if (!normalized) continue;
    const labeledMatch = normalized.match(/^(insert|update|delete|init)\s*:\s*(.+)$/i);
    if (labeledMatch) {
      const label = String(labeledMatch[1] || '').toLowerCase();
      const payload = labeledMatch[2].trim();
      const labeledObj = payload ? tryParse(payload) : null;
      if (labeledObj) {
        if (Array.isArray(labeledObj)) {
          labeledObj.forEach((item) => {
            if (item && typeof item === 'object' && !('action' in item)) item.action = label;
            pushAction(item);
          });
        } else if (labeledObj && typeof labeledObj === 'object') {
          if (!('action' in labeledObj)) labeledObj.action = label;
          pushAction(labeledObj);
        }
        continue;
      }
    }
    const obj = tryParse(normalized);
    if (obj) {
      if (Array.isArray(obj)) {
        obj.forEach(pushAction);
      } else {
        pushAction(obj);
      }
    }
  }
  const functionActions = parseFunctionActions(cleaned);
  if (functionActions.length) actions.push(...functionActions);
  return dedupeActions(actions);
};
