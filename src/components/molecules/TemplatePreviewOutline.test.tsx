import { render, screen } from '@testing-library/react'
import {
  TemplatePreviewOutline,
  type TemplatePreviewOutlineProps,
} from '@/components/molecules/TemplatePreviewOutline'
import { ICON } from '@/components/molecules/slash-entries'
import { PREMADE_TEMPLATES } from '@/lib/templates/premade'
import { instantiateTemplate } from '@/lib/templates/instantiate'
import { templateOutlineRows } from '@/lib/templates/preview'

/** 6f frame 3's recipe example: `big number — time, list — ingredients, checklist —
 *  method, entry log — cooked, text — notes` (matches `preview.test.ts`'s `RECIPE`). */
const RECIPE: TemplatePreviewOutlineProps['rows'] = [
  { kind: 'big number', label: 'time', height: 92, icon: ICON.number },
  { kind: 'list', label: 'ingredients', height: 110, icon: ICON.list },
  { kind: 'checklist', label: 'method', height: 110, icon: ICON.check },
  { kind: 'entry log', label: 'cooked', height: 44, icon: ICON.log },
  { kind: 'text', label: 'notes', height: 44, icon: ICON.text },
]

describe('TemplatePreviewOutline', () => {
  it('draws one row per block, each named `{kind} — {label}` at its own height', () => {
    render(<TemplatePreviewOutline rows={RECIPE} />)

    const rows = screen.getAllByText(/^(big number|list|checklist|entry log|text) — /)
    expect(rows.map((row) => row.textContent)).toEqual([
      'big number — time',
      'list — ingredients',
      'checklist — method',
      'entry log — cooked',
      'text — notes',
    ])
    expect(
      rows.map((row) => row.closest('[data-part="outline-row"]')?.getAttribute('style'))
    ).toEqual([
      'height: 92px; background-color: var(--chart-fill-band);',
      'height: 110px; background-color: var(--chart-fill-band);',
      'height: 110px; background-color: var(--chart-fill-band);',
      'height: 44px; background-color: var(--chart-fill-band);',
      'height: 44px; background-color: var(--chart-fill-band);',
    ])
  })

  it('names a row by its bare kind when the block has no label', () => {
    render(
      <TemplatePreviewOutline rows={[{ kind: 'file', label: '', height: 44, icon: ICON.file }]} />
    )

    expect(screen.getByText('file')).toBeInTheDocument()
  })

  it('renders every premade template without throwing, icon included', () => {
    for (const kind of Object.keys(PREMADE_TEMPLATES) as (keyof typeof PREMADE_TEMPLATES)[]) {
      const { blocks } = instantiateTemplate(PREMADE_TEMPLATES[kind])
      const { unmount } = render(<TemplatePreviewOutline rows={templateOutlineRows(blocks)} />)
      unmount()
    }
  })

  it('fades in honouring prefers-reduced-motion', () => {
    render(<TemplatePreviewOutline rows={RECIPE} />)

    const row = screen.getAllByText(/^big number — /)[0].closest('[data-part="outline-row"]')
    expect(row?.className).toContain('starting:opacity-0')
    expect(row?.className).toContain('motion-reduce:transition-none')
  })
})
