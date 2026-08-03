// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getPageContext, getCleanedPageText, getFocusedElementInfo, extractInputs } from '../../lib/page-context';

function stubRects() {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
  });
}

function shimInnerText() {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent ?? '';
    },
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
  stubRects();
  shimInnerText();
});

describe('getPageContext', () => {
  it('extracts headings, interactive elements and paragraphs', () => {
    document.title = 'Test Page';
    document.body.innerHTML = `
      <h1>Page Heading</h1>
      <h2>Sub Heading</h2>
      <button id="cta">Click Me</button>
      <input id="search" type="text" placeholder="Search..." />
      <p id="visible">This is a visible paragraph with plenty of text.</p>
      <p id="hidden" style="display:none">This hidden paragraph must be excluded.</p>
    `;

    const ctx = getPageContext();

    expect(ctx.title).toBe('Test Page');
    expect(ctx.text).toContain('Page Heading');
    expect(ctx.text).toContain('Sub Heading');
    expect(ctx.text).toContain('Click Me');
    expect(ctx.text).toContain('This is a visible paragraph');
    expect(ctx.text).not.toContain('hidden paragraph');
  });

  it('caps cleaned page text at 4000 characters', () => {
    const longParagraphs = Array.from({ length: 12 }, (_, i) =>
      `<p>Long paragraph ${i}: ${'x'.repeat(500)}</p>`,
    ).join('');
    document.body.innerHTML = longParagraphs;

    const text = getCleanedPageText();

    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text.length).toBe(4000);
  });

  it('excludes invisible elements from extraction', () => {
    document.body.innerHTML = `
      <h1 style="display:none">Hidden Heading</h1>
      <button style="display:none">Hidden Button</button>
      <p style="display:none">Hidden long paragraph that should not appear anywhere.</p>
      <h1>Visible Heading</h1>
    `;

    const text = getCleanedPageText();

    expect(text).toContain('Visible Heading');
    expect(text).not.toContain('Hidden');
  });
});

describe('getFocusedElementInfo', () => {
  it('reports the focused input element details', () => {
    document.body.innerHTML = `
      <input id="search" type="text" placeholder="Search..." />
    `;
    const input = document.getElementById('search') as HTMLInputElement;
    input.value = 'hello world';
    input.focus();

    const info = getFocusedElementInfo();

    expect(info).not.toBeNull();
    expect(info!.text).toBe('hello world');
    expect(info!.placeholder).toBe('Search...');
    expect(info!.tag).toBe('input');
    expect(info!.selector).toBe('#search');
  });

  it('returns null when no input element is focused', () => {
    document.body.innerHTML = `<p>Nothing focused here.</p>`;

    expect(getFocusedElementInfo()).toBeNull();
  });

  it('returns null when the focused input is a password field', () => {
    document.body.innerHTML = `
      <input id="pw" type="password" value="hunter2" />
    `;
    const input = document.getElementById('pw') as HTMLInputElement;
    input.focus();

    expect(getFocusedElementInfo()).toBeNull();
  });

  it('returns null when the focused input has autocomplete="one-time-code"', () => {
    document.body.innerHTML = `
      <input id="otp" type="text" autocomplete="one-time-code" />
    `;
    const input = document.getElementById('otp') as HTMLInputElement;
    input.value = '123456';
    input.focus();

    expect(getFocusedElementInfo()).toBeNull();
  });
});

describe('extractInputs', () => {
  it('skips sensitive inputs but includes normal text inputs', () => {
    document.body.innerHTML = `
      <input id="name" type="text" placeholder="Your name" value="Ada" />
      <input id="pw" type="password" placeholder="Password" value="secret123" />
      <input id="pw2" type="text" autocomplete="current-password" placeholder="Current password" value="s3cret" />
    `;

    const lines = extractInputs();

    expect(lines).toContain('  [input] Your name = "Ada"');
    expect(lines.some((l) => l.includes('secret123'))).toBe(false);
    expect(lines.some((l) => l.includes('s3cret'))).toBe(false);
  });
});
