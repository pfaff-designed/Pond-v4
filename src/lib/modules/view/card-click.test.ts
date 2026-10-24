/**
 * Unit tests for the board-card click filter.
 *
 * A card is selected on click, but it can also host interactive
 * children — the title input, a calendar card's drag handle. A click that lands
 * on (or inside) any of those must NOT also select it; only a click on the
 * card's passive body should.
 */
import { shouldOpenRowFromClick, shouldSelectCardFromClick } from './card-click'

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
