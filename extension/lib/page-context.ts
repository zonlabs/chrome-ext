export interface FocusedElementInfo {
  text: string;
  placeholder: string;
  tag: string;
  selector: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
}

const SENSITIVE_INPUT_TYPES = [
  'password', 'otp', 'one-time-code', 'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
];
const SENSITIVE_AUTOCOMPLETE = ['current-password', 'new-password', 'one-time-code', 'cc-number', 'cc-csc'];
const SENSITIVE_INPUT_TYPE_SET = new Set(SENSITIVE_INPUT_TYPES);
const SENSITIVE_AUTOCOMPLETE_SET = new Set(SENSITIVE_AUTOCOMPLETE);

function isSensitiveInput(el: Element): boolean {
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (SENSITIVE_INPUT_TYPE_SET.has(type)) return true;
  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase();
  return autocomplete.split(/\s+/).some((token) => SENSITIVE_AUTOCOMPLETE_SET.has(token));
}

export function getFocusedElementInfo(): FocusedElementInfo | null {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return null;
  const tag = el.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || el.isContentEditable;
  if (!isInput) return null;
  if (isSensitiveInput(el)) return null;
  const value = ((el as HTMLInputElement).value ?? el.textContent ?? '').slice(0, 5000);
  const placeholder = (el as HTMLInputElement).placeholder ?? '';
  if (!value && !placeholder) return null;
  return { text: value, placeholder: placeholder.slice(0, 200), tag, selector: el.id ? `#${el.id}` : tag };
}

export function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || (el as HTMLElement).hidden) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return true;
}

export function extractHeadings(): string[] {
  const lines: string[] = [];
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const h of headings) {
    if (!isVisible(h)) continue;
    const level = h.tagName.toLowerCase();
    const text = (h as HTMLElement).innerText?.trim();
    if (text) lines.push(`${'#'.repeat(parseInt(level[1] || '1', 10))} ${text}`);
  }
  return lines;
}

export function extractInteractive(): string[] {
  const lines: string[] = [];
  const selectors = 'a, button, [role="button"], [tabindex]:not([tabindex="-1"])';
  const elements = document.querySelectorAll(selectors);
  const seen = new Set<string>();
  for (const el of elements) {
    if (!isVisible(el)) continue;
    const text = (el as HTMLElement).innerText?.trim() || (el as HTMLElement).ariaLabel || '';
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const tag = el.tagName.toLowerCase();
    const href = (el as HTMLAnchorElement).href || '';
    let hrefOut = '';
    if (href && tag === 'a') {
      try { hrefOut = ` → ${new URL(href).pathname}`; } catch { hrefOut = ''; }
    }
    lines.push(`  [${tag}] ${text}${hrefOut}`);
  }
  return lines;
}

export function extractInputs(): string[] {
  const lines: string[] = [];
  const sensitiveTypeSelector = SENSITIVE_INPUT_TYPES.map((t) => `:not([type="${t}"])`).join('');
  const elements = document.querySelectorAll(
    `input:not([type="hidden"])${sensitiveTypeSelector}, textarea, select, [contenteditable="true"]`,
  );
  for (const el of elements) {
    if (!isVisible(el)) continue;
    if (isSensitiveInput(el)) continue;
    const tag = el.tagName.toLowerCase();
    const label = document.querySelector(`label[for="${(el as HTMLElement).id}"]`)?.textContent?.trim()
      || (el as HTMLInputElement).placeholder
      || (el as HTMLElement).ariaLabel
      || '';
    const value = (el as HTMLInputElement).value?.trim() || '';
    if (label) lines.push(`  [${tag}] ${label}${value ? ` = "${value}"` : ''}`);
  }
  return lines;
}

export function extractParagraphs(): string[] {
  const lines: string[] = [];
  const elements = document.querySelectorAll('p, li, td, th, blockquote, figcaption, [role="paragraph"]');
  for (const el of elements) {
    if (!isVisible(el)) continue;
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length > 10) lines.push(text.slice(0, 500));
  }
  return lines;
}

export function getCleanedPageText(): string {
  const parts: string[] = [];

  const title = document.title?.trim();
  if (title) parts.push(`Title: ${title}`);

  const headings = extractHeadings();
  if (headings.length) parts.push(`\nHeadings:\n${headings.join('\n')}`);

  const interactive = extractInteractive();
  if (interactive.length) parts.push(`\nInteractive Elements:\n${interactive.join('\n')}`);

  const inputs = extractInputs();
  if (inputs.length) parts.push(`\nInputs:\n${inputs.join('\n')}`);

  const paragraphs = extractParagraphs();
  if (paragraphs.length) parts.push(`\nContent:\n${paragraphs.slice(0, 40).join('\n')}`);

  return parts.join('\n').slice(0, 4000);
}

export function getPageContext(): PageSnapshot {
  return {
    url: window.location.href,
    title: document.title?.trim() || '',
    text: getCleanedPageText(),
  };
}
