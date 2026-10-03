/**
 * Unit tests for the board-card click filter (#64).
 *
 * A card `<li>` opens its page preview on click, but the card also hosts
 * interactive children — the drag handle, the title input, the ↗ open button.
 * A click that lands on (or inside) any of those must NOT also open the preview;
 * only a click on the card's passive body should.
 *
 * The fixture mirrors what a card actually draws: #223 deleted the per-card ×, so
 * the ↗ open button is the trailing control the filter has to exclude.
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
    <button type="button" aria-label="Open card">↗</button>
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

  it('does NOT open from a click on a button (drag handle, ↗ open)', () => {
    const li = buildCard()
    expect(shouldOpenCardFromClick(li.querySelector('[aria-label="Drag card"]'))).toBe(false)
    expect(shouldOpenCardFromClick(li.querySelector('[aria-label="Open card"]'))).toBe(false)
  })

  it('does NOT open from a click on the title input', () => {
    const li = buildCard()
    expect(shouldOpenCardFromClick(li.querySelector('input'))).toBe(false)
  })

  it('does NOT open from a click inside a nested interactive element', () => {
    const li = buildCard()
    const btn = li.querySelector('[aria-label="Open card"]') as HTMLElement
    const inner = document.createElement('span')
    btn.appendChild(inner)
    expect(shouldOpenCardFromClick(inner)).toBe(false)
  })

  it('does NOT open from a non-element target', () => {
    expect(shouldOpenCardFromClick(null)).toBe(false)
    expect(shouldOpenCardFromClick(document)).toBe(false)
  })
})
