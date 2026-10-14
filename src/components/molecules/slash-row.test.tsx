import { render, screen } from '@testing-library/react'
import { Row, type RowEntry } from '@/components/molecules/slash-row'
import { COMPOSER_POP } from '@/components/molecules/picker-chrome'

const ENTRY: RowEntry = {
  kind: 'row',
  id: 'r1',
  label: 'kitchen renovation',
  pre: 'kitchen renovation',
  hit: '',
  post: '',
  sub: 'home',
}

describe('Row — the shared PondPicker row (slash-row.tsx)', () => {
  it('with neither prop renders byte-identical classes to before', () => {
    render(<Row entry={ENTRY} selected={false} onHover={jest.fn()} onPick={jest.fn()} />)

    const row = screen.getByRole('option')
    expect(row.className).toBe(
      'flex cursor-default items-center gap-[10px] rounded-[10px] px-[10px] font-mono leading-[normal] tracking-[.01em] py-[7px] text-[12.5px] text-mn-text bg-transparent'
    )
    expect(row.querySelector('[data-part="label"]')?.className).toBe(
      'min-w-0 truncate font-normal'
    )
    expect(row.querySelector('[data-part="sub"]')?.className).toBe(
      'min-w-0 truncate text-[10.5px] text-mn-text-secondary'
    )
    expect(row.querySelector('[data-part="icon"]')).toBeNull()
  })

  it('with a mark renders it inside a 13×13 data-part="icon" slot', () => {
    render(
      <Row
        entry={ENTRY}
        selected={false}
        onHover={jest.fn()}
        onPick={jest.fn()}
        mark={<span data-testid="the-mark">●</span>}
      />
    )

    const icon = screen.getByText('●').closest('[data-part="icon"]')
    expect(icon).not.toBeNull()
    expect(icon?.className).toBe('flex h-[13px] w-[13px] flex-none items-center justify-center')
  })

  it('a mark is not drawn when the entry already carries an icon', () => {
    render(
      <Row
        entry={{ ...ENTRY, icon: { d: 'M0 0', filled: false } }}
        selected={false}
        onHover={jest.fn()}
        onPick={jest.fn()}
        mark={<span data-testid="the-mark">●</span>}
      />
    )

    expect(screen.queryByText('●')).toBeNull()
  })

  it('with chrome carries the composer row/label/sub classes', () => {
    render(
      <Row
        entry={ENTRY}
        selected={false}
        onHover={jest.fn()}
        onPick={jest.fn()}
        chrome={COMPOSER_POP.row}
      />
    )

    const row = screen.getByRole('option')
    expect(row.className).toContain(COMPOSER_POP.row.row)
    expect(row.querySelector('[data-part="label"]')?.className).toBe(
      `min-w-0 truncate ${COMPOSER_POP.row.label}`
    )
    expect(row.querySelector('[data-part="sub"]')?.className).toBe(COMPOSER_POP.row.sub)
  })
})
