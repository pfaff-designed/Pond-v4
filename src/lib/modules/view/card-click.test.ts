/**
 * Unit tests for the board-card click filter.
 *
 * A card is selected on click, but it can also host interactive
 * children — the title input, a calendar card's drag handle. A click that lands
 * on (or inside) any of those must NOT also select it; only a click on the
 * card's passive body should.
 */
import { shouldSelectCardFromClick, shouldSelectRowFromClick } from './card-click'

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
    <td class="title-cell"><input aria-label="Title" /></td>
    <td class="value-cell"><span class="value">Doing</span></td>
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

describe('shouldSelectRowFromClick', () => {
  it('selects from a click on a bare td (no nested control)', () => {
    const tr = buildRow()
    expect(shouldSelectRowFromClick(tr)).toBe(true)
    expect(shouldSelectRowFromClick(tr.querySelector('.value-cell'))).toBe(true)
    expect(shouldSelectRowFromClick(tr.querySelector('.value'))).toBe(true)
  })

  it('does NOT select from a click on an input inside the cell', () => {
    const tr = buildRow()
    expect(shouldSelectRowFromClick(tr.querySelector('input'))).toBe(false)
  })

  it('does NOT select from a click on a button inside the cell', () => {
    const tr = buildRow()
    const td = tr.querySelector('.value-cell') as HTMLElement
    td.innerHTML += '<button type="button">Open</button>'
    expect(shouldSelectRowFromClick(td.querySelector('button'))).toBe(false)
  })

  it('does NOT select from a non-element target', () => {
    expect(shouldSelectRowFromClick(null)).toBe(false)
    expect(shouldSelectRowFromClick(document)).toBe(false)
  })
})
