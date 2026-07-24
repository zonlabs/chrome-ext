export function formatToolName(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Unknown Tool';

  let parts = raw.split('_');
  if (parts[0] === 'tool' && parts.length > 1) {
    parts = parts.slice(2);
  }

  let start = 0;
  while (start < parts.length - 1) {
    const seg = parts[start];
    if (seg.length <= 5 && /[A-Z]/.test(seg)) {
      start++;
    } else {
      break;
    }
  }
  parts = parts.slice(start);

  let cleaned = parts.join('_');

  if (!cleaned.includes('_')) {
    cleaned = cleaned.replace(/([A-Z])/g, ' $1').trim();
  } else {
    cleaned = cleaned
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function getToolSummary(rawName: string, args: any, output: any, state: string): string {
  if (!rawName) return 'Running capability';
  const name = rawName.toLowerCase();

  const isExecuting = state === 'input-streaming' || state !== 'output-available' && state !== 'output-error';

  let count = 0;
  let hasCount = false;
  if (output) {
    if (Array.isArray(output)) {
      count = output.length;
      hasCount = true;
    } else if (typeof output === 'object') {
      const listKey = Object.keys(output).find(k => Array.isArray(output[k]));
      if (listKey) {
        count = output[listKey].length;
        hasCount = true;
      }
    }
  }

  if (name.includes('web_search') || name.includes('search_web')) {
    if (isExecuting) return 'Searching the web...';
    if (hasCount) return `Found ${count} search result${count === 1 ? '' : 's'}`;
    return 'Searched the web';
  }
  if (name.includes('web_fetch') || name.includes('fetch_web')) {
    if (isExecuting) return 'Fetching web page...';
    return 'Fetched web page content';
  }
  if (name.includes('gettabcontent')) {
    if (isExecuting) return 'Reading tab content...';
    return 'Read active tab content';
  }
  if (name.includes('getactivetabs')) {
    if (isExecuting) return 'Retrieving active tabs...';
    if (hasCount) return `Retrieved ${count} active tab${count === 1 ? '' : 's'}`;
    return 'Retrieved active tabs';
  }
  if (name.includes('listplugins') || name.includes('list_plugins')) {
    if (isExecuting) return 'Listing plugins...';
    if (hasCount) return `Listed ${count} connected plugin${count === 1 ? '' : 's'}`;
    return 'Listed connected plugins';
  }
  if (name.includes('listresources') || name.includes('list_resources')) {
    if (isExecuting) return 'Listing resources...';
    if (hasCount) return `Listed ${count} resource${count === 1 ? '' : 's'}`;
    return 'Listed resources';
  }
  if (name.includes('listtools') || name.includes('list_tools')) {
    if (isExecuting) return 'Listing tools...';
    if (hasCount) return `Listed ${count} tool${count === 1 ? '' : 's'}`;
    return 'Listed tools';
  }

  const formatted = formatToolName(rawName);
  if (isExecuting) return `Calling ${formatted}...`;
  return `Called ${formatted}`;
}

export function getToolIcon(rawName: string, state: string) {
  let icon: string;
  if (state === 'output-error') icon = 'AlertCircle';
  else if (!rawName) icon = 'Wrench';
  else {
    const name = rawName.toLowerCase();
    if (name === 'gettabcontent' || name === 'getactivetabs') icon = 'AppWindow';
    else if (name.includes('search')) icon = 'Search';
    else if (name.includes('fetch') || name.includes('navigate') || name.includes('browse') || name.includes('scrape') || name.includes('web')) icon = 'Globe';
    else if (name.includes('list')) icon = 'List';
    else if (name.includes('get') || name.includes('read') || name.includes('file') || name.includes('export')) icon = 'FileText';
    else icon = 'Wrench';
  }
  return icon;
}
