/**
 * Unit tests for the board-card click filter.
 *
 * A card is selected on click, but it can also host interactive
 * children — the title input, a calendar card's drag handle. A click that lands
 * on (or inside) any of those must NOT also select it; only a click on the
 * card's passive body should.
 */
import { isContextMenuField, shouldOpenRowFromClick, shouldSelectCardFromClick } from './card-click'

function buildCard(): HTMLElement {
  const li = document.createElement('li')
  li.innerHTML = `
    <button type="button" aria-label="Drag card">⠿</button>
    <div class="body">
      <input aria-label="Card title" />
      <div class="chips"><span class="chip">Doing</span></div>
    </div>
  `
  document.body.appendChild(li)
  return li
}

function buildRow(): HTMLTableRowElement {
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td data-part="title-cell"><input aria-label="Title" /><span>Title text</span></td>
    <td class="value-cell"><button type="button">Doing</button></td>
  `
  document.body.appendChild(tr)
  return tr
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('shouldSelectCardFromClick', () => {
  it('opens from a click on the card body (passive element)', () => {
    const li = buildCard()
    expect(shouldSelectCardFromClick(li)).toBe(true)
    expect(shouldSelectCardFromClick(li.querySelector('.chips'))).toBe(true)
    expect(shouldSelectCardFromClick(li.querySelector('.chip'))).toBe(true)
  })

  it('does NOT open from a click on a button (a calendar card’s drag handle)', () => {
    const li = buildCard()
    expect(shouldSelectCardFromClick(li.querySelector('[aria-label="Drag card"]'))).toBe(false)
  })

  it('does NOT open from a click on the title input', () => {
    const li = buildCard()
    expect(shouldSelectCardFromClick(li.querySelector('input'))).toBe(false)
  })

  it('does NOT open from a click inside a nested interactive element', () => {
    const li = buildCard()
    const btn = li.querySelector('[aria-label="Drag card"]') as HTMLElement
    const inner = document.createElement('span')
    btn.appendChild(inner)
    expect(shouldSelectCardFromClick(inner)).toBe(false)
  })

  it('does NOT open from a non-element target', () => {
    expect(shouldSelectCardFromClick(null)).toBe(false)
    expect(shouldSelectCardFromClick(document)).toBe(false)
  })
})

describe('shouldOpenRowFromClick', () => {
  it.each([
    [
      'the title td itself',
      (tr: HTMLTableRowElement) => tr.querySelector('[data-part="title-cell"]'),
      true,
    ],
    ['the title input', (tr: HTMLTableRowElement) => tr.querySelector('input'), true],
    ['the title span', (tr: HTMLTableRowElement) => tr.querySelector('span'), true],
    ['a field td', (tr: HTMLTableRowElement) => tr.querySelector('.value-cell'), false],
    ['a control inside a field td', (tr: HTMLTableRowElement) => tr.querySelector('button'), false],
  ])('%s', (_name, pick, expected) => {
    const tr = buildRow()
    expect(shouldOpenRowFromClick(pick(tr))).toBe(expected)
  })

  it('does NOT open from a non-element target', () => {
    expect(shouldOpenRowFromClick(null)).toBe(false)
    expect(shouldOpenRowFromClick(document)).toBe(false)
  })

  it('does NOT open from a text node', () => {
    const tr = buildRow()
    const span = tr.querySelector('span') as HTMLElement
    expect(shouldOpenRowFromClick(span.firstChild)).toBe(false)
  })
})

/**
 * A right-click on a card's own field (an input, a cell's textarea) keeps the
 * browser's menu (copy/paste); a right-click anywhere else on the card — even a
 * whole `role="button"` wrapper (page-link, highlight) or a bare `td` — opens
 * the block menu instead (KAN-485). The one `[contenteditable]` exception is a
 * text block's own prose root (`role="textbox"`), which never reaches this
 * check from `BlockCanvas` but is covered here as the boundary case.
 */
describe('isContextMenuField', () => {
  function buildFields(): HTMLElement {
    const div = document.createElement('div')
    div.innerHTML = `
      <div role="button" aria-label="Open a page">
        <span>a page link card</span>
      </div>
      <table>
        <tr><td><input aria-label="cell input" /></td><td class="bare-cell">plain</td></tr>
      </table>
      <textarea aria-label="a field"></textarea>
      <select aria-label="a select"><option>a</option></select>
      <div contenteditable="true" data-part="field-rich-text">a field's own rich text</div>
      <div role="textbox" contenteditable="true">prose editor root</div>
    `
    document.body.appendChild(div)
    return div
  }

  it.each([
    [
      'a role="button" card wrapper',
      (root: HTMLElement) => root.querySelector('[role="button"]'),
      false,
    ],
    ['text inside that card wrapper', (root: HTMLElement) => root.querySelector('span'), false],
    ['a bare td', (root: HTMLElement) => root.querySelector('.bare-cell'), false],
    ['an input inside a td', (root: HTMLElement) => root.querySelector('input'), true],
    ['a textarea', (root: HTMLElement) => root.querySelector('textarea'), true],
    ['a select', (root: HTMLElement) => root.querySelector('select'), true],
    [
      "a field's own contenteditable",
      (root: HTMLElement) => root.querySelector('[data-part="field-rich-text"]'),
      true,
    ],
    [
      'a text block’s own prose root ([role="textbox"])',
      (root: HTMLElement) => root.querySelector('[role="textbox"]'),
      false,
    ],
  ])('%s', (_name, pick, expected) => {
    const root = buildFields()
    expect(isContextMenuField(pick(root))).toBe(expected)
  })

  it('does NOT treat a non-element target as a field', () => {
    expect(isContextMenuField(null)).toBe(false)
    expect(isContextMenuField(document)).toBe(false)
  })
})
