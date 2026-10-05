/**
 * Unit tests for the board-card click filter (#64).
 *
 * A card opens its page preview on click, but it can also host interactive
 * children — the title input, a calendar card's drag handle. A click that lands
 * on (or inside) any of those must NOT also open the preview; only a click on the
 * card's passive body should.
 */
import { shouldOpenCardFromClick } from './card-click'

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

afterEach(() => {
  document.body.innerHTML = ''
})

describe('shouldOpenCardFromClick', () => {
  it('opens from a click on the card body (passive element)', () => {
    const li = buildCard()
    expect(shouldOpenCardFromClick(li)).toBe(true)
    expect(shouldOpenCardFromClick(li.querySelector('.chips'))).toBe(true)
    expect(shouldOpenCardFromClick(li.querySelector('.chip'))).toBe(true)
  })

  it('does NOT open from a click on a button (a calendar card’s drag handle)', () => {
    const li = buildCard()
    expect(shouldOpenCardFromClick(li.querySelector('[aria-label="Drag card"]'))).toBe(false)
  })

  it('does NOT open from a click on the title input', () => {
    const li = buildCard()
    expect(shouldOpenCardFromClick(li.querySelector('input'))).toBe(false)
  })

  it('does NOT open from a click inside a nested interactive element', () => {
    const li = buildCard()
    const btn = li.querySelector('[aria-label="Drag card"]') as HTMLElement
    const inner = document.createElement('span')
    btn.appendChild(inner)
    expect(shouldOpenCardFromClick(inner)).toBe(false)
  })

  it('does NOT open from a non-element target', () => {
    expect(shouldOpenCardFromClick(null)).toBe(false)
    expect(shouldOpenCardFromClick(document)).toBe(false)
  })
})
