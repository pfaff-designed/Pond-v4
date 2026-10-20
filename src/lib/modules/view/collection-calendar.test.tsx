import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionCalendar } from './collection-calendar'
import { CollectionView } from './view'
import { CALENDAR_EMPTY_LINE } from './kinds'
import { localDateIso } from './due'
import { formatAtomDate } from '@/lib/properties/date-input'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'
import type { CollectionRow } from './apply'
import type { ViewBlock } from './schema'

const schemaWithDate: PropertySchema = [
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-title', name: 'Title', type: 'text' },
]
const schemaNoDate: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]

const rows: CollectionRow[] = [
  { id: 'r1', title: 'Trim the rim', values: { 'p-due': '2026-09-10' } },
]

describe('CollectionCalendar — month span chrome and empty state (#262 1/3)', () => {
  it('a collection with no date property renders the DC’s emptyLine inside the card, chrome and grid still drawn', () => {
    render(<CollectionCalendar schema={schemaNoDate} rows={rows} />)
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(CALENDAR_EMPTY_LINE).toBe(
      'nothing in this view has a date. records show here once they have one.'
    )
    // isMonthD/isMonthM don't depend on isEmpty — chrome and the (empty) grid stay.
    expect(screen.getByLabelText('Previous month')).toBeInTheDocument()
    expect(screen.getByLabelText('Next month')).toBeInTheDocument()
    expect(screen.getByText('today')).toBeInTheDocument()
    expect(screen.getAllByText('mon').length).toBeGreaterThan(0)
  })

  it('with no date property and onAddDateField wired, offers the `add a date field` remedy and fires it (KAN-292)', async () => {
    const user = userEvent.setup()
    const onAddDateField = jest.fn()
    const { container } = render(
      <CollectionCalendar schema={schemaNoDate} rows={rows} onAddDateField={onAddDateField} />
    )
    expect(container.querySelector('[data-part="empty"][data-empty-box="box"]')).not.toBeNull()
    const button = screen.getByRole('button', { name: 'add a date field' })
    await user.click(button)
    expect(onAddDateField).toHaveBeenCalledTimes(1)
  })

  it('with no date property and no onAddDateField wired, draws the bare emptyLine span, no box', () => {
    const { container } = render(<CollectionCalendar schema={schemaNoDate} rows={rows} />)
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="empty"]')).toBeNull()
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
  })

  it('with a date property, never offers the remedy — even with zero rows', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={[]} onAddDateField={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
  })

  it('a view with no records draws the emptyLine inside the chrome — the DC’s `empty` state (KAN-262 decision a)', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={[]} />)
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByLabelText('Previous month')).toBeInTheDocument()
    expect(screen.getByText('today')).toBeInTheDocument()
    expect(screen.getAllByText('mon').length).toBeGreaterThan(0)
  })

  it('a collection with a date property draws the chrome, not the empty line', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Previous month')).toBeInTheDocument()
    expect(screen.getByLabelText('Next month')).toBeInTheDocument()
    expect(screen.getByText('today')).toBeInTheDocument()
  })

  describe('records without a date (KAN-454)', () => {
    const dated: CollectionRow = {
      id: 'r1',
      title: 'Trim the rim',
      values: { 'p-due': '2026-09-10' },
    }
    const undated = (id: string, title: string): CollectionRow => ({
      id,
      title,
      values: {},
    })

    it('shows n without a date under the header, in the empty-line style, when some records lack a date', () => {
      render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[dated, undated('r2', 'dentist'), undated('r3', 'optician')]}
        />
      )
      const line = screen.getByText('2 without a date')
      expect(line.tagName).toBe('BUTTON')
      expect(line).toHaveClass(
        'px-0.5',
        'text-[13px]',
        'font-mono',
        'lowercase',
        'text-mn-text-secondary'
      )
      const header = screen.getByRole('button', { name: 'today' }).closest('div.flex-wrap')
      expect(line.previousElementSibling).toBe(header)
      expect(line.nextElementSibling).toHaveClass('md:flex')
      expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
      expect(screen.getAllByText('mon').length).toBeGreaterThan(0)
    })

    it('does not show the line when every record has a date', () => {
      render(<CollectionCalendar schema={schemaWithDate} rows={[dated]} />)
      expect(screen.queryByText(/without a date/)).not.toBeInTheDocument()
    })

    it('does not show the line when the collection has no records', () => {
      render(<CollectionCalendar schema={schemaWithDate} rows={[]} />)
      expect(screen.queryByText(/without a date/)).not.toBeInTheDocument()
      expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    })

    it('does not show the line when the collection has no date field', () => {
      render(<CollectionCalendar schema={schemaNoDate} rows={[undated('r2', 'dentist')]} />)
      expect(screen.queryByText(/without a date/)).not.toBeInTheDocument()
      expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    })

    it('updates the count when a record gains a date', () => {
      const Harness = () => {
        const [items, setItems] = useState<CollectionRow[]>([
          dated,
          undated('r2', 'dentist'),
          undated('r3', 'optician'),
        ])
        const handleDateDentist = () => {
          setItems([
            dated,
            { id: 'r2', title: 'dentist', values: { 'p-due': '2026-09-21' } },
            undated('r3', 'optician'),
          ])
        }
        return (
          <>
            <button type="button" onClick={handleDateDentist}>
              date dentist
            </button>
            <CollectionCalendar schema={schemaWithDate} rows={items} />
          </>
        )
      }
      render(<Harness />)
      expect(screen.getByText('2 without a date')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'date dentist' }))
      expect(screen.getByText('1 without a date')).toBeInTheDocument()
      expect(screen.queryByText('2 without a date')).not.toBeInTheDocument()
    })

    it('clicking 2 without a date lists dentist and optician, not the dated record', async () => {
      const user = userEvent.setup()
      const onMoveDate = jest.fn()
      render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[dated, undated('r2', 'dentist'), undated('r3', 'optician')]}
          onMoveDate={onMoveDate}
        />
      )

      await user.click(screen.getByRole('button', { name: '2 without a date' }))

      const list = screen.getByRole('listbox', { name: 'without a date' })
      expect(list.closest('[data-part="glass"]')).not.toBeNull()
      const dentist = within(list).getByRole('option', { name: 'dentist' })
      const optician = within(list).getByRole('option', { name: 'optician' })
      expect(within(list).queryByRole('option', { name: 'Trim the rim' })).not.toBeInTheDocument()
      expect(dentist).toHaveAttribute('data-part', 'row')
      expect(optician).toHaveAttribute('data-part', 'row')
      expect(dentist.querySelector('[data-part="icon"] span')).toHaveClass(
        'size-[9px]',
        'rounded-[2.5px]'
      )
      expect(optician.querySelector('[data-part="icon"] span')).toHaveClass(
        'size-[9px]',
        'rounded-[2.5px]'
      )

      await user.click(screen.getByRole('button', { name: '2 without a date' }))
      expect(screen.queryByRole('listbox', { name: 'without a date' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '2 without a date' }))
      expect(screen.getByRole('listbox', { name: 'without a date' })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('listbox', { name: 'without a date' })).not.toBeInTheDocument()
      expect(onMoveDate).not.toHaveBeenCalled()
    })

    it('draws heart on dentist and ring on optician', async () => {
      const user = userEvent.setup()
      const withGlyph = (id: string, title: string, glyph: string): CollectionRow => ({
        id,
        title,
        values: {},
        glyph,
      })
      render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[dated, withGlyph('r2', 'dentist', 'heart'), withGlyph('r3', 'optician', 'ring')]}
        />
      )

      await user.click(screen.getByRole('button', { name: '2 without a date' }))

      const list = screen.getByRole('listbox', { name: 'without a date' })
      const dentist = within(list).getByRole('option', { name: 'dentist' })
      const optician = within(list).getByRole('option', { name: 'optician' })
      expect(dentist.querySelector('[data-area-mark] [data-icon="heart"]')).not.toBeNull()
      expect(optician.querySelector('[data-icon="ring"]')).not.toBeNull()
      expect(within(list).queryByRole('option', { name: dated.title })).not.toBeInTheDocument()
    })

    it('picking a record arms placement, day cells take a hover state, and Escape writes nothing', async () => {
      const user = userEvent.setup()
      const onMoveDate = jest.fn()
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[dated, undated('r2', 'dentist'), undated('r3', 'optician')]}
          onMoveDate={onMoveDate}
        />
      )
      const dayCells = () => container.querySelectorAll('[data-part="calendar-day-cell"]')
      expect(dayCells().length).toBeGreaterThan(0)
      for (const cell of dayCells()) {
        expect(cell).not.toHaveClass('hover:bg-mn-hover-fill')
      }

      await user.click(screen.getByRole('button', { name: '2 without a date' }))
      await user.click(
        within(screen.getByRole('listbox', { name: 'without a date' })).getByRole('option', {
          name: /dentist/,
        })
      )

      expect(screen.queryByRole('listbox', { name: 'without a date' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'pick a day for dentist' })).toBeInTheDocument()
      for (const cell of dayCells()) {
        expect(cell).toHaveClass('hover:bg-mn-hover-fill')
      }

      await user.keyboard('{Escape}')

      expect(screen.getByRole('button', { name: '2 without a date' })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'pick a day for dentist' })
      ).not.toBeInTheDocument()
      expect(onMoveDate).not.toHaveBeenCalled()
      for (const cell of dayCells()) {
        expect(cell).not.toHaveClass('hover:bg-mn-hover-fill')
      }
    })

    it('clicking a day writes that date, the record sits on that day, and the line count drops', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onMoveDate = jest.fn()
      const onAddRow = jest.fn()
      try {
        const { container, rerender } = render(
          <CollectionCalendar
            schema={schemaWithDate}
            rows={[dated, undated('r2', 'dentist'), undated('r3', 'optician')]}
            editable
            onAddRow={onAddRow}
            onMoveDate={onMoveDate}
          />
        )
        const dayCell = (iso: string) =>
          container.querySelector<HTMLElement>(
            `[data-part="calendar-day-cell"][data-iso="${iso}"]`
          )!

        await user.click(screen.getByRole('button', { name: '2 without a date' }))
        await user.click(
          within(screen.getByRole('listbox', { name: 'without a date' })).getByRole('option', {
            name: /dentist/,
          })
        )
        await user.click(dayCell('2026-09-21'))

        expect(onMoveDate).toHaveBeenCalledTimes(1)
        expect(onMoveDate).toHaveBeenCalledWith('r2', 'p-due', '2026-09-21')
        expect(onAddRow).not.toHaveBeenCalled()

        rerender(
          <CollectionCalendar
            schema={schemaWithDate}
            rows={[
              dated,
              { id: 'r2', title: 'dentist', values: { 'p-due': '2026-09-21' } },
              undated('r3', 'optician'),
            ]}
            editable
            onAddRow={onAddRow}
            onMoveDate={onMoveDate}
          />
        )

        expect(screen.getByText('1 without a date')).toBeInTheDocument()
        expect(within(dayCell('2026-09-21')).getByText('dentist')).toBeInTheDocument()
      } finally {
        jest.useRealTimers()
      }
    })

    it('shows n without a date when every record is undated, and keeps the grid empty line', () => {
      render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[undated('r1', 'dentist'), undated('r2', 'optician'), undated('r3', 'library')]}
        />
      )
      expect(screen.getByText('3 without a date')).toBeInTheDocument()
      expect(screen.getByText('3 records, none with a date')).toBeInTheDocument()
      expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
    })

    it('opens dentist, checkup, and lab, then Escape closes the list', () => {
      const onMoveDate = jest.fn()
      render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[undated('d1', 'dentist'), undated('d2', 'checkup'), undated('d3', 'lab')]}
          onMoveDate={onMoveDate}
        />
      )
      expect(screen.getByRole('button', { name: '3 without a date' })).toBeInTheDocument()
      expect(screen.getByText('3 records, none with a date')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '3 without a date' }))
      const list = screen.getByRole('listbox', { name: 'without a date' })
      expect(within(list).getByRole('option', { name: 'dentist' })).toBeInTheDocument()
      expect(within(list).getByRole('option', { name: 'checkup' })).toBeInTheDocument()
      expect(within(list).getByRole('option', { name: 'lab' })).toBeInTheDocument()
      fireEvent.keyDown(list, { key: 'Escape' })
      expect(screen.queryByRole('listbox', { name: 'without a date' })).not.toBeInTheDocument()
      expect(onMoveDate).not.toHaveBeenCalled()
    })
  })

  it('says none with a date when every record is undated', () => {
    const undated: CollectionRow[] = [
      { id: 'r1', title: 'Trim the rim', values: {} },
      { id: 'r2', title: 'Undated', values: {} },
    ]
    render(<CollectionCalendar schema={schemaWithDate} rows={undated} />)
    expect(screen.getByText('2 records, none with a date')).toBeInTheDocument()
    expect(
      screen.queryByText('nothing in this view has a date. records show here once they have one.')
    ).not.toBeInTheDocument()
  })

  it('still shows the empty line when the dated collection has no records', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={[]} />)
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
  })

  describe('the desktop month grid', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('a day with 4 dated rows renders 3 then ＋1 more', () => {
      const fourRows: CollectionRow[] = [
        { id: 'r1', title: 'first', values: { 'p-due': '2026-09-10' } },
        { id: 'r2', title: 'second', values: { 'p-due': '2026-09-10' } },
        { id: 'r3', title: 'third', values: { 'p-due': '2026-09-10' } },
        { id: 'r4', title: 'fourth', values: { 'p-due': '2026-09-10' } },
      ]
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={fourRows} />)
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      expect(within(desktopWrap).getByText('first')).toBeInTheDocument()
      expect(within(desktopWrap).getByText('second')).toBeInTheDocument()
      expect(within(desktopWrap).getByText('third')).toBeInTheDocument()
      expect(within(desktopWrap).queryByText('fourth')).not.toBeInTheDocument()
      expect(within(desktopWrap).getByText('＋1 more')).toBeInTheDocument()
    })

    it("today's cell carries the orange chip", () => {
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      expect(within(desktopWrap).getByText('10')).toHaveClass('bg-mn-signal-dated')
    })
  })

  describe('prev/next/today stepping and the card chrome', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('next advances the period label to the next month; today returns to the current month', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      expect(screen.getByText('september 2026')).toBeInTheDocument()

      await user.click(screen.getByLabelText('Next month'))
      expect(screen.getByText('october 2026')).toBeInTheDocument()
      expect(screen.queryByText('september 2026')).not.toBeInTheDocument()

      await user.click(screen.getByText('today'))
      expect(screen.getByText('september 2026')).toBeInTheDocument()
    })

    it("carries the DC's light-paper/dark-card root tokens", () => {
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const card = container.querySelector('[data-part="calendar-card"]')!
      for (const cls of [
        'bg-mn-card',
        'rounded-[20px]',
        'shadow-[0_1px_2px_rgba(40,34,24,.04),0_8px_24px_rgba(40,34,24,.06)]',
        'dark:shadow-[0_1px_2px_rgba(0,0,0,.3),0_8px_24px_rgba(0,0,0,.34)]',
      ]) {
        expect(card.className).toContain(cls)
      }
    })
  })

  describe("today reads the local calendar date, not UTC's", () => {
    beforeEach(() => {
      // A UTC instant near local midnight — on any machine or CI runner,
      // whatever timezone it runs in, Date's local getters and `toISOString`
      // read different calendar days here. The expectation below is derived
      // from `localDateIso`, the same helper the component calls, so the
      // assertion holds in every timezone rather than just this machine's.
      jest.useFakeTimers().setSystemTime(new Date('2026-10-01T03:30:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('the chip and the period label read the local calendar date', () => {
      const [year, month] = localDateIso(new Date()).split('-').map(Number)
      const periodLabel = new Date(year, month - 1, 1)
        .toLocaleDateString('en-US', { month: 'long' })
        .toLowerCase()
      const expectedLabel = `${periodLabel} ${year}`
      const expectedDay = String(new Date().getDate())

      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      expect(screen.getByText(expectedLabel)).toBeInTheDocument()
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      const todayChip = desktopWrap.querySelector('[data-part="due-today"]')
      expect(todayChip).toHaveTextContent(expectedDay)
    })
  })

  describe('the mobile dot grid (isMonthM)', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('renders instead of the week grid at the md breakpoint, dots capped at 3', () => {
      const fourRows: CollectionRow[] = [
        { id: 'r1', title: 'first', values: { 'p-due': '2026-09-10' } },
        { id: 'r2', title: 'second', values: { 'p-due': '2026-09-10' } },
        { id: 'r3', title: 'third', values: { 'p-due': '2026-09-10' } },
        { id: 'r4', title: 'fourth', values: { 'p-due': '2026-09-10' } },
      ]
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={fourRows} />)
      const grids = [...container.querySelectorAll('div')].filter((d) =>
        d.classList.contains('grid-cols-7')
      )
      const mobileGrid = grids.find((g) => g.classList.contains('md:hidden'))
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )
      expect(mobileGrid).toBeTruthy()
      expect(desktopWrap).toBeTruthy()
      // desktop draws rows (week grids), mobile draws dots — the two never coexist at one breakpoint.
      expect(desktopWrap!.classList.contains('hidden')).toBe(true)
      expect(mobileGrid!.classList.contains('md:hidden')).toBe(true)

      const tenNumber = within(mobileGrid!).getByText('10')
      const cell = tenNumber.closest('button')!
      expect(cell.querySelectorAll('.bg-mn-text').length).toBe(3)
    })

    it("today's dot-grid chip carries the orange signal, same as desktop", () => {
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      const mobileGrid = [...container.querySelectorAll('div')].find(
        (d) => d.classList.contains('grid-cols-7') && d.classList.contains('md:hidden')
      )!
      expect(within(desktopWrap).getByText('10')).toHaveClass('bg-mn-signal-dated')
      expect(within(mobileGrid).getByText('10')).toHaveClass('bg-mn-signal-dated')
    })

    it("the week-row and per-cell hairlines carry the DC's hair = a(ink ? .14 : .09)", () => {
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const weekRow = container.querySelector('.md\\:flex .grid-cols-7.border-t')!
      expect(weekRow).toHaveClass('border-mn-text/[0.09]')
      expect(weekRow).toHaveClass('dark:border-mn-text/[0.14]')
      const cellBorder = container.querySelector('.border-l.border-mn-text\\/\\[0\\.09\\]')!
      expect(cellBorder).toHaveClass('dark:border-mn-text/[0.14]')
    })
  })

  describe("the mobile focused-day list (showList for mob && span === 'month')", () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('tapping a day with two dated rows lists both titles; tapping another day moves the list', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const twoRows: CollectionRow[] = [
        { id: 'r1', title: 'order splashback samples', values: { 'p-due': '2026-09-12' } },
        { id: 'r2', title: 'choose oak veneer finish', values: { 'p-due': '2026-09-12' } },
      ]
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={twoRows} />)
      const focusList = container.querySelector<HTMLElement>('[data-part="calendar-focus-list"]')!

      await user.click(screen.getByRole('button', { name: '12 sep' }))
      expect(within(focusList).getByText('order splashback samples')).toBeInTheDocument()
      expect(within(focusList).getByText('choose oak veneer finish')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '13 sep' }))
      expect(within(focusList).queryByText('order splashback samples')).not.toBeInTheDocument()
      expect(within(focusList).queryByText('choose oak veneer finish')).not.toBeInTheDocument()
      expect(within(focusList).getByText('nothing dated')).toBeInTheDocument()
    })

    it("the focus list's top hairline carries the DC's hair = a(ink ? .14 : .09)", () => {
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const focusList = container.querySelector('[data-part="calendar-focus-list"]')!
      expect(focusList).toHaveClass('border-mn-text/[0.09]')
      expect(focusList).toHaveClass('dark:border-mn-text/[0.14]')
    })

    it("a tapped day's head reads the DC's weekday/month label, ' · today' only on today", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const focusList = container.querySelector<HTMLElement>('[data-part="calendar-focus-list"]')!
      expect(within(focusList).getByText('thu sep · today')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '12 sep' }))
      expect(within(focusList).getByText('sat sep')).toBeInTheDocument()
      expect(within(focusList).queryByText('thu sep · today')).not.toBeInTheDocument()
    })
  })

  describe('adding a record from a day cell (KAN-352)', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    function cellFor(container: HTMLElement, iso: string) {
      return container.querySelector<HTMLElement>(
        `[data-part="calendar-day-cell"][data-iso="${iso}"]`
      )!
    }

    it('the plus and Enter add that day’s record; a blank click does not', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      let resolveAdd: (id: string) => void = () => {}
      const onAddRow = jest.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveAdd = resolve
          })
      )
      const onRenameRow = jest.fn()
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
        />
      )

      // Enter on a stack item selects it (KAN-358). It must not also add a day.
      const occupied = within(cellFor(container, '2026-09-10'))
        .getByText('Trim the rim')
        .closest('div')!
      occupied.focus()
      await user.keyboard('{Enter}')
      expect(onAddRow).not.toHaveBeenCalled()

      const cell = cellFor(container, '2026-09-20')
      const plus = within(cell).getByRole('button', { name: 'Add on 20 sep' })
      await user.click(plus)
      await user.click(plus)
      expect(onAddRow).toHaveBeenCalledTimes(1)
      expect(onAddRow).toHaveBeenCalledWith({ 'p-due': '2026-09-20' })

      await act(async () => {
        resolveAdd('r-new')
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      cell.focus()
      await user.keyboard('{Enter}')
      expect(onAddRow).toHaveBeenCalledTimes(2)
      expect(onAddRow).toHaveBeenLastCalledWith({ 'p-due': '2026-09-20' })

      await act(async () => {
        resolveAdd('r-new-2')
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      // Blank space opens the day (KAN-455) and must not add a record.
      fireEvent.click(cell)
      expect(onAddRow).toHaveBeenCalledTimes(2)
      expect(onRenameRow).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
    })

    it('adding from the plus selects the record, opens the peek, and focuses the title with the date set', async () => {
      const iso = '2026-09-20'
      const mint = jest.fn().mockResolvedValue('r-new')
      function Harness() {
        const [liveRows, setLiveRows] = useState<CollectionRow[]>([])
        const onAddRow = async (values?: Record<string, PropertyValue>) => {
          const id = await mint()
          setLiveRows((prev) => [...prev, { id: id as string, title: '', values: values ?? {} }])
          return id as string
        }
        return (
          <CollectionCalendar
            schema={schemaWithDate}
            rows={liveRows}
            editable
            onAddRow={onAddRow}
            onRenameRow={jest.fn()}
          />
        )
      }
      const { container } = render(<Harness />)
      // The month is already pinned to the faked today. Real timers let the
      // add's state update flush; modern fake timers hold React's scheduler.
      jest.useRealTimers()
      const user = userEvent.setup()

      await user.click(
        within(cellFor(container, iso)).getByRole('button', { name: 'Add on 20 sep' })
      )
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      const item = cellFor(container, iso).querySelector<HTMLElement>('[data-row-id="r-new"]')
      expect(item).toHaveClass('ring-[1.5px]', 'ring-inset', 'ring-mn-text')
      expect(screen.getByLabelText('Record: Untitled')).toBeInTheDocument()
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Record title' }))
      expect(screen.getByRole('button', { name: 'Due value' })).toHaveTextContent(
        formatAtomDate(iso)
      )
      expect(mint).toHaveBeenCalledTimes(1)
    })

    it('a typed title stays on the day after Esc closes the peek', async () => {
      const iso = '2026-09-20'
      const renames: Array<[string, string]> = []
      function Harness() {
        const [liveRows, setLiveRows] = useState<CollectionRow[]>([])
        const onAddRow = async (values?: Record<string, PropertyValue>) => {
          const id = 'r-new'
          setLiveRows((prev) => [...prev, { id, title: '', values: values ?? {} }])
          return id
        }
        // The calendar calls onRenameRow and does not store the title. The
        // harness applies it the way the page does, so the day's stack can show it.
        const onRenameRow = (rowId: string, title: string) => {
          renames.push([rowId, title])
          setLiveRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
        }
        return (
          <CollectionCalendar
            schema={schemaWithDate}
            rows={liveRows}
            editable
            onAddRow={onAddRow}
            onRenameRow={onRenameRow}
          />
        )
      }
      const { container } = render(<Harness />)
      // The month is already pinned to the faked today. Real timers let the
      // add's state update flush; modern fake timers hold React's scheduler.
      jest.useRealTimers()
      const user = userEvent.setup()

      await user.click(
        within(cellFor(container, iso)).getByRole('button', { name: 'Add on 20 sep' })
      )
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Record title' }))
      // Enter commits before Esc. Esc on a still-dirty title reverts and writes nothing.
      await user.keyboard('dentist{Enter}')

      const cell = cellFor(container, iso)
      expect(renames).toEqual([['r-new', 'dentist']])
      expect(within(cell).getByText('dentist')).toBeInTheDocument()
      expect(screen.getByLabelText('Record: dentist')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      expect(screen.queryByLabelText('Record: dentist')).not.toBeInTheDocument()
      expect(within(cell).getByText('dentist')).toBeInTheDocument()
      expect(renames).toEqual([['r-new', 'dentist']])
    })

    it('clicking an existing day-item row never opens the input (stopPropagation on MonthDayStack)', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onAddRow = jest.fn().mockResolvedValue('r-new')
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={onAddRow}
          onRenameRow={jest.fn()}
        />
      )

      await user.click(within(cellFor(container, '2026-09-10')).getByText('Trim the rim'))
      // Selecting the row opens its own peek (KAN-358) — its title/field inputs are
      // not the day cell's add-row input, which is the one this guard is about.
      expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
      expect(onAddRow).not.toHaveBeenCalled()
    })

    it('Escape on the focused day cell adds nothing', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onAddRow = jest.fn().mockResolvedValue('r-new')
      const onRenameRow = jest.fn()
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[]}
          editable
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
        />
      )

      cellFor(container, '2026-09-20').focus()
      await user.keyboard('{Escape}')

      expect(onAddRow).not.toHaveBeenCalled()
      expect(onRenameRow).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
    })

    it('not editable (or no date property) draws no clickable cell at all', () => {
      const { container: notEditable } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={[]}
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
        />
      )
      expect(cellFor(notEditable, '2026-09-20')).not.toHaveAttribute('role', 'button')

      const { container: noDate } = render(
        <CollectionCalendar
          schema={schemaNoDate}
          rows={rows}
          editable
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
        />
      )
      expect(noDate.querySelector('[data-part="calendar-day-cell"][role="button"]')).toBeNull()
    })
  })

  describe('selecting a day’s event (KAN-358)', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('clicking a stack item draws the selected ring and opens the record peek, without opening the day cell’s add input', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
        />
      )
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      const item = within(desktopWrap).getByText('Trim the rim').closest('div')!
      expect(item).not.toHaveClass('ring-[1.5px]')
      expect(screen.queryByLabelText('Record: Trim the rim')).not.toBeInTheDocument()

      await user.click(item)

      expect(item).toHaveClass('ring-[1.5px]', 'ring-inset', 'ring-mn-text')
      expect(screen.getByLabelText('Record: Trim the rim')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
    })

    it('↵ on an unselected stack item selects it without opening the record; ↵ again (selected) opens it', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onOpenRow = jest.fn()
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
          onOpenRow={onOpenRow}
        />
      )
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      const item = within(desktopWrap).getByText('Trim the rim').closest('div')!
      item.focus()

      await user.keyboard('{Enter}')

      expect(item).toHaveClass('ring-[1.5px]')
      expect(onOpenRow).not.toHaveBeenCalled()

      await user.keyboard('{Enter}')

      expect(onOpenRow).toHaveBeenCalledWith('r1')
    })

    it('a second click on the already-selected stack item also opens the record', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onOpenRow = jest.fn()
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
          onOpenRow={onOpenRow}
        />
      )
      const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
        d.classList.contains('md:flex')
      )!
      const item = within(desktopWrap).getByText('Trim the rim').closest('div')!

      await user.click(item)
      expect(onOpenRow).not.toHaveBeenCalled()

      await user.click(item)

      expect(onOpenRow).toHaveBeenCalledWith('r1')
    })
  })

  describe('selecting a day’s event in the mobile focus list (KAN-358)', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('clicking a focus-list row draws the selected ring and opens the record peek', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
        />
      )
      const focusList = container.querySelector<HTMLElement>('[data-part="calendar-focus-list"]')!
      const item = within(focusList).getByText('Trim the rim').closest('div')!
      expect(item).not.toHaveClass('ring-[1.5px]')
      expect(screen.queryByLabelText('Record: Trim the rim')).not.toBeInTheDocument()

      await user.click(item)

      expect(item).toHaveClass('ring-[1.5px]', 'ring-inset', 'ring-mn-text')
      expect(screen.getByLabelText('Record: Trim the rim')).toBeInTheDocument()
    })

    it('↵ on an unselected focus-list row selects it without opening the record; ↵ again (selected) opens it', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onOpenRow = jest.fn()
      const { container } = render(
        <CollectionCalendar
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
          onOpenRow={onOpenRow}
        />
      )
      const focusList = container.querySelector<HTMLElement>('[data-part="calendar-focus-list"]')!
      const item = within(focusList).getByText('Trim the rim').closest('div')!
      item.focus()

      await user.keyboard('{Enter}')

      expect(item).toHaveClass('ring-[1.5px]')
      expect(onOpenRow).not.toHaveBeenCalled()

      await user.keyboard('{Enter}')

      expect(onOpenRow).toHaveBeenCalledWith('r1')
    })
  })
})

describe('CollectionCalendar — a day cell is not a button around its events (KAN-358 fix)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  function cellFor(container: HTMLElement, iso: string) {
    return container.querySelector<HTMLElement>(
      `[data-part="calendar-day-cell"][data-iso="${iso}"]`
    )!
  }

  it('no day cell is role="button", addable or not', () => {
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={rows}
        editable
        onAddRow={jest.fn()}
        onRenameRow={jest.fn()}
      />
    )
    expect(container.querySelector('[data-part="calendar-day-cell"][role="button"]')).toBeNull()
  })

  it('an addable day’s "Add on …" button adds that day and does not open an inline input', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onAddRow = jest.fn().mockResolvedValue('r-new')
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={[]}
        editable
        onAddRow={onAddRow}
        onRenameRow={jest.fn()}
      />
    )
    const addButton = within(cellFor(container, '2026-09-20')).getByRole('button', {
      name: 'Add on 20 sep',
    })

    await user.click(addButton)

    expect(onAddRow).toHaveBeenCalledWith({ 'p-due': '2026-09-20' })
    expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
  })

  it('an event item sits inside the day cell but outside any role="button"', () => {
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={rows}
        editable
        onAddRow={jest.fn()}
        onRenameRow={jest.fn()}
      />
    )
    const item = within(cellFor(container, '2026-09-10')).getByText('Trim the rim')
    expect(item.closest('[role="button"]')).toBeNull()
  })

  it('a hovered or focused day cell shows a hand-drawn plus', () => {
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={[]}
        editable
        onAddRow={jest.fn()}
        onRenameRow={jest.fn()}
      />
    )
    const cell = cellFor(container, '2026-09-20')
    const addButton = within(cell).getByRole('button', { name: 'Add on 20 sep' })
    const plus = addButton.querySelector('svg')

    // `userEvent.hover` does not set :hover in jsdom, so the reveal is the
    // named group classes. Bare `group` would also match BlockCanvas's wrapper.
    expect(cell).toHaveClass('group/day')
    expect(cell).not.toHaveClass('group')
    expect(cell).toHaveAttribute('tabindex', '0')
    cell.focus()
    expect(document.activeElement).toBe(cell)

    expect(addButton).toHaveAttribute('tabindex', '-1')
    expect(addButton).not.toHaveClass('sr-only')
    expect(addButton).toHaveClass(
      'absolute',
      'right-1',
      'top-1',
      'text-mn-text-secondary',
      'opacity-0',
      'group-hover/day:opacity-100',
      'group-focus-within/day:opacity-100'
    )
    expect(addButton).not.toHaveTextContent('＋')
    expect(plus).not.toBeNull()
    expect(plus).toHaveAttribute('width', '12')
    expect(plus).toHaveAttribute('height', '12')
    expect(plus).toHaveAttribute('viewBox', '0 0 12 12')
    expect(plus).toHaveAttribute('stroke', 'currentColor')
    expect(plus).toHaveAttribute('stroke-width', '1.4')
    expect(plus).toHaveAttribute('stroke-linecap', 'round')
    expect(plus).toHaveAttribute('aria-hidden', 'true')
    expect(plus?.querySelector('path')).toHaveAttribute('d', 'M6 2.4v7.2M2.4 6h7.2')
  })
})

describe('CollectionView — dragging a calendar event onto another day (KAN-385 path)', () => {
  const dragConfig: ViewBlock = { id: 'cal', type: 'view', mode: 'calendar' }
  const dragRows: CollectionRow[] = [
    { id: 'r1', title: 'Trim the rim', values: { 'p-due': '2026-09-12' } },
  ]
  /** The pointer-position rect each day cell resolves to, keyed by its `data-iso`
   *  (`usePointerBucketDrag` hit-tests the bucket under the pointer by DOM rect).
   *  Any cell not named here falls back to jsdom's all-zero rect. */
  const DAY_RECTS: Record<string, [number, number, number, number]> = {
    '2026-09-12': [0, 0, 100, 100],
    '2026-09-15': [200, 0, 300, 100],
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const iso = this.getAttribute('data-iso')
      const [left, top, right, bottom] = (iso && DAY_RECTS[iso]) || [0, 0, 0, 0]
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this
        },
      } as DOMRect
    })
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  function cellFor(container: HTMLElement, iso: string) {
    return container.querySelector<HTMLElement>(
      `[data-part="calendar-day-cell"][data-iso="${iso}"]`
    )!
  }

  function rowItem(container: HTMLElement, iso: string) {
    return within(cellFor(container, iso)).getByText('Trim the rim').closest('div')!
  }

  /** The scroll container `usePointerBucketDrag`'s `containerHandlers` are spread
   *  onto — the element a pointer leaving the grid (off its edge) fires on. */
  function gridContainer(container: HTMLElement) {
    return cellFor(container, '2026-09-12').closest('.md\\:flex.md\\:flex-col')!
  }

  /** `onMoveDate` wired without a real `moveRowDate` behind it — the DOM never
   *  moves, matching `board-drag-click.test.tsx`'s board (`onEdit` is a stub too). */
  function renderStatic(onMoveDate: (rowId: string, key: string, value: PropertyValue) => void) {
    return render(
      <CollectionView
        config={dragConfig}
        schema={schemaWithDate}
        rows={dragRows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={onMoveDate}
      />
    )
  }

  /** `onMoveDate` wired to a stateful harness, the way `moveRowDate` really is —
   *  so a completed drop's write is observable in the re-rendered grid, not just
   *  in the mock's call args. */
  function CalendarHarness({
    onMoveDate,
  }: {
    onMoveDate: (rowId: string, key: string, value: PropertyValue) => void
  }) {
    const [rows, setRows] = useState<CollectionRow[]>(dragRows)
    return (
      <CollectionView
        config={dragConfig}
        schema={schemaWithDate}
        rows={rows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={(rowId, key, value) => {
          onMoveDate(rowId, key, value)
          setRows((prev) =>
            prev.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: value } } : r))
          )
        }}
      />
    )
  }

  it('a drag past the 4px threshold onto another day moves the event there and writes its new date', () => {
    const onMoveDate = jest.fn()
    const { container } = render(<CalendarHarness onMoveDate={onMoveDate} />)
    const item = rowItem(container, '2026-09-12')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).toHaveBeenCalledWith('r1', 'p-due', '2026-09-15')
    expect(within(cellFor(container, '2026-09-15')).getByText('Trim the rim')).toBeInTheDocument()
    expect(
      within(cellFor(container, '2026-09-12')).queryByText('Trim the rim')
    ).not.toBeInTheDocument()
  })

  it('the grid container carries select-none only while a drag is active, so native text selection never races the drag', () => {
    const { container } = renderStatic(jest.fn())
    const item = rowItem(container, '2026-09-12')
    const grid = gridContainer(container)

    expect(grid.className).not.toMatch(/select-none/)
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    expect(grid.className).not.toMatch(/select-none/) // below the drag threshold: still a candidate click
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    expect(grid.className).toMatch(/select-none/)
    fireEvent.pointerUp(item)
    expect(grid.className).not.toMatch(/select-none/)
  })

  it('the click after a drag ends does not select; the next click does (mirrors board-drag-click.test.tsx)', () => {
    const { container } = renderStatic(jest.fn())
    const item = rowItem(container, '2026-09-12')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    fireEvent.pointerUp(item)
    fireEvent.click(item)
    expect(screen.queryByLabelText('Record: Trim the rim')).not.toBeInTheDocument()

    jest.advanceTimersByTime(0)
    fireEvent.click(item)
    expect(screen.getByLabelText('Record: Trim the rim')).toBeInTheDocument()
  })

  it('a press that never travels is a click: it selects and opens the record peek at once', () => {
    const { container } = renderStatic(jest.fn())
    const item = rowItem(container, '2026-09-12')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(item)
    fireEvent.click(item)

    expect(screen.getByLabelText('Record: Trim the rim')).toBeInTheDocument()
  })

  it('a drop back onto the row’s own day calls nothing', () => {
    const onMoveDate = jest.fn()
    const { container } = renderStatic(onMoveDate)
    const item = rowItem(container, '2026-09-12')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).not.toHaveBeenCalled()
  })

  it('the pointer leaving the grid (off an edge, no further pointermove) cancels: calls nothing', () => {
    const onMoveDate = jest.fn()
    const { container } = renderStatic(onMoveDate)
    const item = rowItem(container, '2026-09-12')

    // Moved onto the 15th's own mocked rect (a real, different bucket) so a leave
    // that wrongly dropped (the old bug) would be caught dropping there, not
    // merely failing to find any bucket at all.
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    fireEvent.pointerLeave(gridContainer(container))

    expect(onMoveDate).not.toHaveBeenCalled()
  })

  it('a selected event dragged back onto its own row does not open the record (drag, not a click)', () => {
    const onOpenRow = jest.fn()
    const { container } = render(
      <CollectionView
        config={dragConfig}
        schema={schemaWithDate}
        rows={dragRows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={jest.fn()}
        onOpenRow={onOpenRow}
      />
    )
    const item = rowItem(container, '2026-09-12')

    // Select it first — the open branch only fires on an already-selected row.
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(item)
    fireEvent.click(item)
    expect(screen.getByLabelText('Record: Trim the rim')).toBeInTheDocument()

    // Drag it and release back onto its own row: the trailing click must not open it.
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(item)
    fireEvent.click(item)

    expect(onOpenRow).not.toHaveBeenCalled()
  })

  it('dragging an event to blank space in its own cell does not open the add input', () => {
    const onAddRow = jest.fn()
    const { container } = render(
      <CollectionView
        config={dragConfig}
        schema={schemaWithDate}
        rows={dragRows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={jest.fn()}
        onAddRow={onAddRow}
        onRenameRow={jest.fn()}
      />
    )
    const item = rowItem(container, '2026-09-12')
    const cell = cellFor(container, '2026-09-12')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(item)
    // The drag ends over blank cell space, not the row — the trailing click
    // lands on the cell itself, same as a real browser's release target.
    fireEvent.click(cell)

    expect(onAddRow).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
  })
})

describe('span pill (KAN-455)', () => {
  const calendarConfig: ViewBlock = { id: 'cal', type: 'view', mode: 'calendar' }

  it('month is selected by default, week is present and unchecked, agenda is present and unchecked, choosing week reports { span: week } once', async () => {
    const user = userEvent.setup()
    const onConfigChange = jest.fn()
    render(
      <CollectionCalendar schema={schemaWithDate} rows={rows} onConfigChange={onConfigChange} />
    )

    const group = screen.getByRole('radiogroup', { name: 'span' })
    expect(within(group).getByRole('radio', { name: 'month' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'week' })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: 'week' })).not.toBeChecked()
    expect(within(group).getByRole('radio', { name: 'day' })).not.toBeChecked()
    expect(within(group).getByRole('radio', { name: 'agenda' })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: 'agenda' })).not.toBeChecked()

    await user.click(within(group).getByRole('radio', { name: 'week' }))

    expect(within(group).getByRole('radio', { name: 'week' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'month' })).not.toBeChecked()
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange).toHaveBeenCalledWith({ span: 'week' })
  })

  it('agenda is present and unchecked by default, and choosing agenda reports { span: agenda } once', async () => {
    const user = userEvent.setup()
    const onConfigChange = jest.fn()
    render(
      <CollectionCalendar schema={schemaWithDate} rows={rows} onConfigChange={onConfigChange} />
    )

    const group = screen.getByRole('radiogroup', { name: 'span' })
    expect(within(group).getByRole('radio', { name: 'agenda' })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: 'agenda' })).not.toBeChecked()
    expect(within(group).getByRole('radio', { name: 'month' })).toBeChecked()

    await user.click(within(group).getByRole('radio', { name: 'agenda' }))

    expect(within(group).getByRole('radio', { name: 'agenda' })).toBeChecked()
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange).toHaveBeenCalledWith({ span: 'agenda' })
  })

  it('seeds the selected span from the view field, and an absent field stays month', () => {
    const { rerender } = render(
      <CollectionCalendar schema={schemaWithDate} rows={rows} span="day" />
    )
    const group = screen.getByRole('radiogroup', { name: 'span' })
    expect(within(group).getByRole('radio', { name: 'day' })).toBeChecked()

    rerender(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
    expect(within(group).getByRole('radio', { name: 'month' })).toBeChecked()
  })

  it('CollectionView passes the active view span and reports { span: day } through its config handler', async () => {
    const user = userEvent.setup()
    const onConfigChange = jest.fn()
    render(
      <CollectionView
        config={{ ...calendarConfig, span: 'day' }}
        schema={schemaWithDate}
        rows={rows}
        onConfigChange={onConfigChange}
      />
    )

    const group = screen.getByRole('radiogroup', { name: 'span' })
    expect(within(group).getByRole('radio', { name: 'day' })).toBeChecked()

    await user.click(within(group).getByRole('radio', { name: 'month' }))

    expect(onConfigChange).toHaveBeenCalledWith({ span: 'month' }, undefined)
  })

  it('CollectionView passes a stored span: agenda and reports { span: agenda } through its config handler', async () => {
    const user = userEvent.setup()
    const onConfigChange = jest.fn()
    render(
      <CollectionView
        config={{ ...calendarConfig, span: 'agenda' }}
        schema={schemaWithDate}
        rows={rows}
        onConfigChange={onConfigChange}
      />
    )

    const group = screen.getByRole('radiogroup', { name: 'span' })
    expect(within(group).getByRole('radio', { name: 'agenda' })).toBeChecked()

    await user.click(within(group).getByRole('radio', { name: 'day' }))
    await user.click(within(group).getByRole('radio', { name: 'agenda' }))

    expect(onConfigChange).toHaveBeenCalledWith({ span: 'agenda' }, undefined)
  })

  it('CollectionView passes a stored span: week and reports { span: week } through its config handler', async () => {
    const user = userEvent.setup()
    const onConfigChange = jest.fn()
    render(
      <CollectionView
        config={{ ...calendarConfig, span: 'week' }}
        schema={schemaWithDate}
        rows={rows}
        onConfigChange={onConfigChange}
      />
    )

    const group = screen.getByRole('radiogroup', { name: 'span' })
    expect(within(group).getByRole('radio', { name: 'week' })).toBeChecked()

    await user.click(within(group).getByRole('radio', { name: 'day' }))
    await user.click(within(group).getByRole('radio', { name: 'week' }))

    expect(onConfigChange).toHaveBeenCalledWith({ span: 'week' }, undefined)
  })
})

describe('day header (KAN-455)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('when the span is day, the period is the day, prev and next step a day, and today stays on the day span', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onConfigChange = jest.fn()
    render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={rows}
        span="day"
        onConfigChange={onConfigChange}
      />
    )

    expect(screen.getByText('mon 19 oct 2026')).toBeInTheDocument()
    expect(screen.queryByText('october 2026')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.getByText('sun 18 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Next day' }))
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.getByText('tue 20 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'today' }))
    expect(screen.getByText('mon 19 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it('choosing day from the pill switches the header onto that day without a month step', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)

    expect(screen.getByText('october 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'day' }))

    expect(screen.getByText('mon 19 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
  })

  it('the month span keeps Previous month and Next month and steps by month', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)

    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next day' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('november 2026')).toBeInTheDocument()
    expect(screen.queryByText('sun 1 nov 2026')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('october 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'today' }))
    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
  })
})

describe('week header', () => {
  const thisWeek = '19 \u2013 25 oct 2026'
  const nextWeek = '26 oct \u2013 1 nov 2026'

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('when the span is week, the period is the week, prev and next step a week, and today stays on the week span', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onConfigChange = jest.fn()
    render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={rows}
        span="week"
        onConfigChange={onConfigChange}
      />
    )

    expect(screen.getByText(thisWeek)).toBeInTheDocument()
    expect(screen.queryByText('october 2026')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next day' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByText(nextWeek)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(screen.getByText(thisWeek)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByText(nextWeek)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'today' }))
    expect(screen.getByText(thisWeek)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it('the month span keeps Previous month and Next month', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} span="month" />)

    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next week' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
  })

  it('the day span keeps Previous day and Next day', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} span="day" />)

    expect(screen.getByText('mon 19 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next week' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
  })
})

describe('agenda header', () => {
  const thisWindow = 'from 19 oct'
  const nextWindow = 'from 2 nov'

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('when the span is agenda, the period is the agenda window, prev and next step fourteen days, and today stays on the agenda span', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onConfigChange = jest.fn()
    render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={rows}
        span="agenda"
        onConfigChange={onConfigChange}
      />
    )

    expect(screen.getByText(thisWindow)).toBeInTheDocument()
    expect(screen.queryByText('october 2026')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'agenda' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Previous agenda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next agenda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next day' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next agenda' }))
    expect(screen.getByText(nextWindow)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'agenda' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Previous agenda' }))
    expect(screen.getByText(thisWindow)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'agenda' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Next agenda' }))
    expect(screen.getByText(nextWindow)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'today' }))
    expect(screen.getByText(thisWindow)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'agenda' })).toBeChecked()
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it('the month span keeps Previous month and Next month and the month label', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} span="month" />)

    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous agenda' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next agenda' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
  })

  it('the week span keeps Previous week and Next week and the week label', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} span="week" />)

    expect(screen.getByText('19 \u2013 25 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous agenda' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next agenda' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()
  })

  it('the day span keeps Previous day and Next day and the day label', () => {
    render(<CollectionCalendar schema={schemaWithDate} rows={rows} span="day" />)

    expect(screen.getByText('mon 19 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous agenda' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next agenda' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
  })
})

describe('agenda list', () => {
  const agendaRows: CollectionRow[] = [
    { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-19' } },
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-20T10:00:00' } },
    { id: 'optician', title: 'optician', values: { 'p-due': '2026-10-21T09:00:00' } },
    { id: 'plaster', title: 'plaster', values: { 'p-due': '2026-10-21' } },
    { id: 'skip', title: 'skip hire', values: { 'p-due': '2026-10-18' } },
    { id: 'renew', title: 'renew', values: { 'p-due': '2026-11-02' } },
  ]

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  const day = (container: HTMLElement, iso: string) => {
    const group = container.querySelector<HTMLElement>(
      `[data-part="calendar-agenda-day"][data-iso="${iso}"]`
    )
    expect(group).not.toBeNull()
    if (!group) throw new Error(`agenda day ${iso} missing`)
    return group
  }

  it('lists coming days from buildAgenda, on both sizes, and draws none of the other bodies', () => {
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={agendaRows} span="agenda" />
    )

    const list = container.querySelector<HTMLElement>('[data-part="calendar-agenda"]')
    expect(list).not.toBeNull()
    if (!list) return
    expect(container.querySelectorAll('[data-part="calendar-agenda"]')).toHaveLength(1)
    expect(list).toHaveClass('flex', 'flex-col')
    expect(list).not.toHaveClass('md:hidden')
    expect(list).not.toHaveClass('hidden')

    const groups = [...list.querySelectorAll<HTMLElement>('[data-part="calendar-agenda-day"]')]
    expect(groups.map((group) => group.dataset.iso)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ])
    for (const group of groups) {
      expect(group).toHaveClass(
        'grid',
        'grid-cols-[52px_minmax(0,1fr)]',
        'gap-2',
        'py-2.5',
        'border-t',
        'border-mn-text/[0.09]',
        'dark:border-mn-text/[0.14]',
        'md:grid-cols-[88px_minmax(0,1fr)]',
        'md:gap-4'
      )
      const head = group.firstElementChild
      expect(head).toHaveClass('flex', 'flex-col', 'gap-0.5', 'pt-1.5')
    }

    const today = day(container, '2026-10-19')
    const todayLabel = within(today).getByText('mon 19 oct · today')
    expect(todayLabel).toHaveClass(
      'text-[10.5px]',
      'font-medium',
      'uppercase',
      'tracking-[.1em]',
      'text-mn-text-secondary'
    )
    const todayNumber = today.querySelector('[data-part="due-today"]')
    expect(todayNumber).toHaveAttribute('data-kind', 'date')
    expect(todayNumber).toHaveClass(
      'inline-flex',
      'h-[30px]',
      'min-w-[30px]',
      'text-[20px]',
      'font-medium',
      'tabular-nums'
    )
    const alcove = within(today)
      .getByText('confirm alcove')
      .closest<HTMLElement>('[data-part="calendar-agenda-item"]')
    expect(alcove).not.toBeNull()
    if (!alcove) return
    expect(alcove.querySelector('[data-part="calendar-agenda-time"]')).toBeNull()
    expect(alcove.querySelector('span')).toHaveClass(
      'size-[13px]',
      'flex-none',
      'rounded-[4px]',
      'ring-[1.4px]',
      'ring-inset',
      'ring-mn-text/[0.32]'
    )
    expect(within(alcove).getByText('confirm alcove')).toHaveClass(
      'min-w-0',
      'flex-1',
      'truncate',
      'text-[15px]',
      'leading-[1.3]',
      'text-mn-text',
      'md:text-[14px]'
    )
    expect(alcove).toHaveClass(
      'flex',
      'items-center',
      'gap-2.5',
      'min-h-11',
      'rounded-[10px]',
      'px-2',
      'md:min-h-[38px]'
    )

    const tuesday = day(container, '2026-10-20')
    expect(within(tuesday).getByText('tue 20 oct')).toBeInTheDocument()
    expect(tuesday.querySelector('[data-part="due-today"]')).toBeNull()
    expect(within(tuesday).getByText('20')).toHaveClass(
      'h-[30px]',
      'min-w-[30px]',
      'text-[20px]',
      'font-medium',
      'tabular-nums',
      'text-mn-text'
    )
    const dentist = within(tuesday)
      .getByText('dentist')
      .closest<HTMLElement>('[data-part="calendar-agenda-item"]')
    expect(dentist?.querySelector('[data-part="calendar-agenda-time"]')).toHaveTextContent('10:00')
    expect(dentist?.querySelector('[data-part="calendar-agenda-time"]')).toHaveClass(
      'text-[11px]',
      'font-medium',
      'text-mn-text/80',
      'tabular-nums'
    )

    const wednesday = day(container, '2026-10-21')
    expect(within(wednesday).getByText('wed 21 oct')).toBeInTheDocument()
    const wednesdayItems = [
      ...wednesday.querySelectorAll<HTMLElement>('[data-part="calendar-agenda-item"]'),
    ]
    expect(wednesdayItems.map((item) => (item.textContent ?? '').replace(/\s+/g, ''))).toEqual([
      'plaster',
      'optician09:00',
    ])
    const opticianTime = wednesdayItems[1]?.querySelector('[data-part="calendar-agenda-time"]')
    expect(opticianTime).toHaveTextContent('09:00')
    expect(wednesdayItems[0]?.querySelector('[data-part="calendar-agenda-time"]')).toBeNull()

    expect(screen.queryByText('skip hire')).not.toBeInTheDocument()
    expect(screen.queryByText('renew')).not.toBeInTheDocument()
    expect(screen.queryByText('thu 22 oct')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-day-cell"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-week-body"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-day-body"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-week-strip"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-focus-list"]')).toBeNull()
  })
})

describe('agenda reach', () => {
  const agendaRows: CollectionRow[] = [
    { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-19' } },
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-20T10:00:00' } },
    { id: 'optician', title: 'optician', values: { 'p-due': '2026-10-21T09:00:00' } },
    { id: 'plaster', title: 'plaster', values: { 'p-due': '2026-10-21' } },
    { id: 'skip', title: 'skip hire', values: { 'p-due': '2026-10-18' } },
    { id: 'renew', title: 'renew', values: { 'p-due': '2026-11-02' } },
  ]

  let previousObserver: typeof window.IntersectionObserver | undefined
  let reachAgendaEnd: () => void

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    previousObserver = window.IntersectionObserver
    let observed: IntersectionObserverCallback | null = null
    reachAgendaEnd = () => {
      const fire = observed
      if (!fire) return
      act(() => {
        fire([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      })
    }
    class AgendaEndObserver implements IntersectionObserver {
      readonly root: Element | Document | null = null
      readonly rootMargin = ''
      readonly thresholds: readonly number[] = []
      private readonly callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe(): void {
        observed = this.callback
      }

      unobserve(): void {}

      disconnect(): void {}

      takeRecords(): IntersectionObserverEntry[] {
        return []
      }
    }
    window.IntersectionObserver = AgendaEndObserver as unknown as typeof IntersectionObserver
  })

  afterEach(() => {
    window.IntersectionObserver = previousObserver as typeof IntersectionObserver
    jest.useRealTimers()
  })

  it('appends the next dated days when the list end is reached', () => {
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={agendaRows} span="agenda" />
    )

    expect(
      [...container.querySelectorAll<HTMLElement>('[data-part="calendar-agenda-day"]')].map(
        (group) => group.dataset.iso
      )
    ).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
    expect(screen.queryByText('renew')).not.toBeInTheDocument()
    expect(screen.queryByText('skip hire')).not.toBeInTheDocument()
    expect(screen.getByText('from 19 oct')).toBeInTheDocument()

    reachAgendaEnd()

    const renewDay = container.querySelector<HTMLElement>(
      '[data-part="calendar-agenda-day"][data-iso="2026-11-02"]'
    )
    expect(renewDay).not.toBeNull()
    if (!renewDay) return
    expect(within(renewDay).getByText('renew')).toBeInTheDocument()
    expect(
      container.querySelector('[data-part="calendar-agenda-day"][data-iso="2026-10-22"]')
    ).toBeNull()
    expect(screen.queryByText('skip hire')).not.toBeInTheDocument()
    expect(screen.getByText('from 19 oct')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'load more' })).toBeNull()
    expect(container.querySelector('[data-part="calendar-agenda-end"]')?.tagName).toBe('DIV')
  })
})

describe('agenda peek', () => {
  const dentist: CollectionRow = {
    id: 'dentist',
    title: 'dentist',
    values: { 'p-due': '2026-10-20T10:00:00' },
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('clicking an agenda item selects it and opens the existing peek, and does not open the record', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onOpenRow = jest.fn()
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={[dentist]}
        span="agenda"
        onOpenRow={onOpenRow}
      />
    )

    const item = container.querySelector<HTMLElement>(
      '[data-part="calendar-agenda-item"]'
    )
    expect(item).not.toBeNull()
    if (!item) return
    expect(item).not.toHaveClass('ring-[1.5px]')
    expect(screen.queryByLabelText('Record: dentist')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-part="record-peek"]')).toHaveLength(0)

    await user.click(item)

    expect(item).toHaveClass('ring-[1.5px]', 'ring-inset', 'ring-mn-text')
    expect(screen.getByLabelText('Record: dentist')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-part="record-peek"]')).toHaveLength(1)
    expect(onOpenRow).not.toHaveBeenCalled()
  })
})

describe('agenda empty', () => {
  const skipHire: CollectionRow = {
    id: 'skip',
    title: 'skip hire',
    values: { 'p-due': '2026-10-18' },
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('a dated row outside the window leaves today with nothing dated, and a later empty window shows that line once', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={[skipHire]} span="agenda" />
    )

    const today = container.querySelector<HTMLElement>(
      '[data-part="calendar-agenda-day"][data-iso="2026-10-19"]'
    )
    expect(today).not.toBeNull()
    if (!today) return
    expect(within(today).getByText('mon 19 oct · today')).toBeInTheDocument()
    const todayNone = within(today).getByText('nothing dated')
    expect(todayNone).toHaveClass('py-2.5', 'text-[13px]', 'text-mn-text-secondary')
    expect(todayNone.compareDocumentPosition(within(today).getByText('mon 19 oct · today'))).toBe(
      Node.DOCUMENT_POSITION_PRECEDING
    )
    expect(screen.queryByText('skip hire')).not.toBeInTheDocument()
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next agenda' }))
    expect(screen.getByText('nothing dated')).toBeInTheDocument()
    expect(screen.getAllByText('nothing dated')).toHaveLength(1)
    expect(screen.queryByText('mon 19 oct · today')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-agenda-day"]')).toBeNull()
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
  })

  it('zero rows still shows the calendar empty line and not nothing dated', () => {
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={[]} span="agenda" />
    )
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.queryByText('nothing dated')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-agenda"]')).toBeNull()
  })

  it('no date field and every row undated keep the calendar empty and omit the agenda list', () => {
    const { container, rerender } = render(
      <CollectionCalendar
        schema={schemaNoDate}
        rows={[{ id: 'note', title: 'note', values: {} }]}
        span="agenda"
      />
    )
    expect(screen.getByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.queryByText('nothing dated')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-agenda"]')).toBeNull()

    rerender(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={[{ id: 'note', title: 'note', values: {} }]}
        span="agenda"
      />
    )
    expect(screen.getByText('1 records, none with a date')).toBeInTheDocument()
    expect(screen.queryByText('nothing dated')).not.toBeInTheDocument()
    expect(screen.queryByText(CALENDAR_EMPTY_LINE)).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-agenda"]')).toBeNull()
  })
})

describe('week body', () => {
  const weekRows: CollectionRow[] = [
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21T10:00:00' } },
  ]
  const heads = ['mon 19', 'tue 20', 'wed 21', 'thu 22', 'fri 23', 'sat 24', 'sun 25']
  const isos = [
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
  ]

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('draws seven day heads and places dentist on Wednesday, and a day head opens that day', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onConfigChange = jest.fn()
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={weekRows}
        span="week"
        onConfigChange={onConfigChange}
      />
    )

    const body = container.querySelector<HTMLElement>(
      '[data-part="calendar-week-body"][data-size="desktop"]'
    )
    expect(body).not.toBeNull()
    if (!body) return
    expect(body).toHaveClass('hidden', 'md:flex', 'md:flex-col')
    expect(container.querySelector('[data-part="calendar-day-cell"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-day-body"]')).toBeNull()

    const headButtons = heads.map((name) => within(body).getByRole('button', { name }))
    expect(headButtons).toHaveLength(7)
    for (const button of headButtons) {
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveClass('flex', 'items-center', 'gap-2', 'px-2', 'pb-2')
    }
    const monday = headButtons[0]
    if (!monday) throw new Error('monday head missing')
    expect(within(monday).getByText('mon')).toHaveClass(
      'text-[10.5px]',
      'font-medium',
      'uppercase',
      'tracking-[.1em]',
      'text-mn-text-secondary'
    )
    expect(monday.querySelector('[data-part="due-today"]')).toHaveClass(
      'inline-flex',
      'h-[26px]',
      'min-w-[26px]',
      'items-center',
      'justify-center',
      'rounded-full',
      'px-1',
      'text-[15px]',
      'font-medium',
      'tabular-nums'
    )
    const tuesday = headButtons[1]
    if (!tuesday) throw new Error('tuesday head missing')
    expect(tuesday.querySelector('[data-part="due-today"]')).toBeNull()
    expect(within(tuesday).getByText('20')).toHaveClass(
      'text-mn-text',
      'inline-flex',
      'h-[26px]',
      'min-w-[26px]',
      'text-[15px]',
      'font-medium',
      'tabular-nums'
    )

    const columns = [...body.querySelectorAll<HTMLElement>('[data-part="calendar-week-column"]')]
    expect(columns.map((column) => column.dataset.iso)).toEqual(isos)
    for (const column of columns) {
      expect(column).toHaveClass('border-l', 'border-mn-text/[0.09]', 'dark:border-mn-text/[0.14]')
    }
    expect(columns[5]).toHaveClass('bg-mn-text/[0.025]')
    expect(columns[6]).toHaveClass('bg-mn-text/[0.025]')
    expect(columns[0]).not.toHaveClass('bg-mn-text/[0.025]')
    expect(columns[2]).not.toHaveClass('bg-mn-text/[0.025]')

    const grid = body.querySelector<HTMLElement>('[data-part="calendar-hour-grid"]')
    expect(grid).not.toBeNull()
    if (!grid) return
    expect(grid.style.height).toBe('484px')
    expect(grid.style.gridTemplateColumns).toBe('52px repeat(7,minmax(0,1fr))')
    expect(grid.querySelector('button')).toBeNull()
    const labels = [...grid.querySelectorAll('[data-part="calendar-hour-label"]')].map(
      (node) => node.textContent
    )
    expect(labels).toEqual([
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ])
    expect(grid.querySelector('[data-part="calendar-hour-label"]')).toHaveClass(
      'text-[10.5px]',
      'font-medium',
      'tabular-nums',
      'text-mn-text-secondary'
    )
    const line = grid.querySelector<HTMLElement>('[data-part="calendar-hour-line"]')
    expect(line).toHaveClass('h-px', 'bg-mn-text/[0.09]', 'dark:bg-mn-text/[0.14]')
    expect(line?.style.left).toBe('52px')

    const wednesday = columns[2]
    if (!wednesday) throw new Error('wednesday column missing')
    const event = within(wednesday)
      .getByText('dentist')
      .closest<HTMLElement>('[data-part="calendar-timed-event"]')
    expect(event).not.toBeNull()
    if (!event) return
    expect(event.style.top).toBe('89px')
    expect(event.style.height).toBe('22px')
    expect(within(event).getByText('dentist')).toHaveClass('text-[12px]', 'font-medium')
    const time = event.querySelector('[data-part="calendar-event-time"]')
    expect(time).toHaveTextContent('10:00')
    expect(time).toHaveClass('text-[10.5px]', 'font-medium', 'text-mn-text/80', 'tabular-nums')
    expect(event).toHaveClass(
      'rounded-[8px]',
      'bg-mn-drag-ghost',
      'shadow-[0_1px_2px_rgba(40,34,24,.08),0_2px_8px_rgba(40,34,24,.07)]',
      'dark:shadow-[0_1px_2px_rgba(0,0,0,.3),0_2px_8px_rgba(0,0,0,.3)]'
    )

    const nowLines = [...body.querySelectorAll('[data-part="calendar-now"]')]
    expect(nowLines).toHaveLength(1)
    expect(nowLines[0]?.closest('[data-part="calendar-week-column"]')).toHaveAttribute(
      'data-iso',
      '2026-10-19'
    )
    expect(nowLines[0]).toHaveClass('h-[1.4px]', 'bg-mn-text')
    expect(nowLines[0]?.querySelector('[data-part="calendar-now-dot"]')).toHaveClass(
      'size-[7px]',
      'bg-mn-text'
    )

    const mondayColumn = columns[0]
    if (!mondayColumn) throw new Error('monday column missing')
    await user.click(mondayColumn)
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()
    expect(onConfigChange).not.toHaveBeenCalled()
    expect(container.querySelector('[data-part="calendar-week-body"]')).not.toBeNull()

    await user.click(within(body).getByRole('button', { name: 'wed 21' }))
    expect(screen.getByText('wed 21 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
    expect(container.querySelector('[data-part="calendar-week-body"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-day-body"]')).not.toBeNull()
    const dayBody = container.querySelector<HTMLElement>('[data-part="calendar-day-body"]')
    if (!dayBody) return
    expect(within(dayBody).getByText('dentist')).toBeInTheDocument()
    expect(dayBody.querySelector('[data-part="calendar-event-time"]')).toHaveTextContent('10:00')
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange).toHaveBeenCalledWith({ span: 'day' })
  })
})

describe('week all day', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('puts date-only confirm alcove in Wednesday’s all-day column and keeps dentist in the hour grid', () => {
    const weekRows: CollectionRow[] = [
      { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21T10:00:00' } },
      { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-21' } },
    ]
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={weekRows} span="week" />
    )

    const body = container.querySelector<HTMLElement>('[data-part="calendar-week-body"]')
    expect(body).not.toBeNull()
    if (!body) return
    const allDay = body.querySelector<HTMLElement>('[data-part="calendar-all-day"]')
    const grid = body.querySelector<HTMLElement>('[data-part="calendar-hour-grid"]')
    expect(allDay).not.toBeNull()
    expect(grid).not.toBeNull()
    if (!allDay || !grid) return

    expect(allDay.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(allDay.style.gridTemplateColumns).toBe('52px repeat(7,minmax(0,1fr))')
    expect(allDay).toHaveClass(
      'py-[6px]',
      'border-y',
      'border-mn-text/[0.09]',
      'dark:border-mn-text/[0.14]'
    )
    expect(within(allDay).getByText('all day')).toHaveClass(
      'text-[10.5px]',
      'font-medium',
      'text-mn-text-secondary'
    )

    const wednesday = body.querySelector<HTMLElement>(
      '[data-part="calendar-week-column"][data-iso="2026-10-21"]'
    )
    expect(wednesday).not.toBeNull()
    if (!wednesday) return
    const item = within(allDay)
      .getByText('confirm alcove')
      .closest<HTMLElement>('[data-part="calendar-all-day-item"]')
    expect(item).not.toBeNull()
    if (!item) return
    expect(item.style.gridColumn).toBe(wednesday.style.gridColumn)
    expect(item).toHaveClass('h-[22px]')
    expect(item.querySelector('span')).toHaveClass('size-[9px]')
    expect(within(item).getByText('confirm alcove')).toHaveClass('text-[11.5px]', 'font-medium')

    expect(within(allDay).queryByText('dentist')).not.toBeInTheDocument()
    expect(within(grid).queryByText('confirm alcove')).not.toBeInTheDocument()
    expect(within(wednesday).getByText('dentist')).toBeInTheDocument()
    expect(wednesday.querySelector('[data-part="calendar-event-time"]')).toHaveTextContent('10:00')
  })

  it('keeps the all day label and one track when the week has only a timed row', () => {
    const weekRows: CollectionRow[] = [
      { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21T10:00:00' } },
    ]
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={weekRows} span="week" />
    )

    const body = container.querySelector<HTMLElement>('[data-part="calendar-week-body"]')
    expect(body).not.toBeNull()
    if (!body) return
    const allDay = body.querySelector<HTMLElement>('[data-part="calendar-all-day"]')
    expect(allDay).not.toBeNull()
    if (!allDay) return
    expect(within(allDay).getByText('all day')).toBeInTheDocument()
    expect(allDay.style.gridTemplateRows).toBe('repeat(1, 24px)')
    expect(allDay.querySelector('[data-part="calendar-all-day-item"]')).toBeNull()

    const grid = body.querySelector<HTMLElement>('[data-part="calendar-hour-grid"]')
    expect(grid).not.toBeNull()
    if (!grid) return
    expect(within(grid).getByText('dentist')).toBeInTheDocument()
  })
})

describe('week phone', () => {
  const thisWeek = '19 \u2013 25 oct 2026'
  const stripDays = ['mon 19', 'tue 20', 'wed 21', 'thu 22', 'fri 23', 'sat 24', 'sun 25']
  const phoneRows: CollectionRow[] = [
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-19' } },
    { id: 'optician', title: 'optician', values: { 'p-due': '2026-10-22' } },
  ]

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('lists the focused day under the week strip and a strip tap leaves the span on week', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onConfigChange = jest.fn()
    const { container } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={phoneRows}
        span="week"
        onConfigChange={onConfigChange}
      />
    )

    const strip = container.querySelector<HTMLElement>('[data-part="calendar-week-strip"]')
    expect(strip).not.toBeNull()
    if (!strip) return
    expect(strip).toHaveClass('md:hidden')
    const stripButtons = stripDays.map((name) => within(strip).getByRole('button', { name }))
    expect(stripButtons.map((button) => button.getAttribute('aria-label'))).toEqual(stripDays)
    expect(within(strip).getByRole('button', { name: 'mon 19' })).toHaveAttribute(
      'aria-current',
      'date'
    )
    expect(within(strip).getByRole('button', { name: 'thu 22' })).not.toHaveAttribute(
      'aria-current'
    )

    const focusList = container.querySelector<HTMLElement>('[data-part="calendar-focus-list"]')
    expect(focusList).not.toBeNull()
    if (!focusList) return
    expect(focusList).toHaveClass('md:hidden')
    expect(strip.compareDocumentPosition(focusList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(focusList).getByText('dentist')).toBeInTheDocument()
    expect(within(focusList).queryByText('optician')).not.toBeInTheDocument()

    const body = container.querySelector<HTMLElement>('[data-part="calendar-week-body"]')
    expect(body).not.toBeNull()
    if (!body) return
    expect(body).toHaveClass('hidden', 'md:flex')
    expect(container.querySelector('[data-part="calendar-day-body"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-day-cell"]')).toBeNull()
    expect(container.querySelector('.gap-y-0\\.5')).toBeNull()

    await user.click(within(strip).getByRole('button', { name: 'thu 22' }))

    expect(screen.getByText(thisWeek)).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'thu 22' })).toHaveAttribute(
      'aria-current',
      'date'
    )
    expect(within(strip).getByRole('button', { name: 'mon 19' })).not.toHaveAttribute(
      'aria-current'
    )
    expect(within(focusList).getByText('optician')).toBeInTheDocument()
    expect(within(focusList).queryByText('dentist')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'week' })).toBeChecked()
    expect(container.querySelector('[data-part="calendar-day-body"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-week-body"]')).not.toBeNull()
    expect(onConfigChange).not.toHaveBeenCalled()
  })
})

describe('day body (KAN-455)', () => {
  const dayRows: CollectionRow[] = [
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21' } },
    { id: 'visit', title: 'site visit', values: { 'p-due': '2026-10-21T10:00:00' } },
  ]

  afterEach(() => {
    jest.useRealTimers()
  })

  function bodies(container: HTMLElement) {
    const desktop = container.querySelector<HTMLElement>(
      '[data-part="calendar-day-body"][data-size="desktop"]'
    )
    const mobile = container.querySelector<HTMLElement>(
      '[data-part="calendar-day-body"][data-size="mobile"]'
    )
    if (!desktop || !mobile) throw new Error('day body missing a metric')
    return { desktop, mobile }
  }

  it('puts a date-only dentist in the all-day row and 10:00 in the hour grid after it', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 21, 12, 0, 0))
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={dayRows} span="day" />
    )

    expect(container.querySelector('[data-part="calendar-day-cell"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-focus-list"]')).toBeNull()
    expect(container.querySelectorAll('[data-part="calendar-day-body"]')).toHaveLength(2)

    const { desktop, mobile } = bodies(container)
    expect(desktop).toHaveClass('hidden', 'md:flex')
    expect(mobile).toHaveClass('md:hidden')
    expect(mobile).not.toHaveClass('hidden')

    for (const body of [desktop, mobile]) {
      const allDay = body.querySelector<HTMLElement>('[data-part="calendar-all-day"]')!
      const grid = body.querySelector<HTMLElement>('[data-part="calendar-hour-grid"]')!
      expect(allDay.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      expect(within(allDay).getByText('all day')).toHaveClass(
        'text-[10.5px]',
        'font-medium',
        'text-mn-text-secondary'
      )
      expect(allDay).toHaveClass('py-[6px]', 'border-mn-text/[0.09]', 'dark:border-mn-text/[0.14]')
      expect(allDay.style.gridTemplateRows).toBe('repeat(1, 24px)')
      const item = within(allDay)
        .getByText('dentist')
        .closest('[data-part="calendar-all-day-item"]')
      expect(item).toHaveClass('h-[22px]')
      expect(within(allDay).getByText('dentist')).toHaveClass('text-[11.5px]', 'font-medium')
      expect(within(allDay).queryByText('10:00')).not.toBeInTheDocument()
      expect(within(allDay).queryByText('site visit')).not.toBeInTheDocument()

      const labels = [...grid.querySelectorAll('[data-part="calendar-hour-label"]')].map(
        (node) => node.textContent
      )
      expect(labels).toEqual([
        '08:00',
        '09:00',
        '10:00',
        '11:00',
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
        '18:00',
      ])
      expect(grid.querySelector('[data-part="calendar-hour-label"]')).toHaveClass(
        'text-[10.5px]',
        'font-medium',
        'tabular-nums',
        'text-mn-text-secondary'
      )

      const event = grid.querySelector<HTMLElement>('[data-part="calendar-timed-event"]')!
      expect(event.compareDocumentPosition(allDay) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
      expect(within(event).getByText('site visit')).toHaveClass('text-[12px]', 'font-medium')
      const time = event.querySelector('[data-part="calendar-event-time"]')
      expect(time).toHaveTextContent('10:00')
      expect(time).toHaveClass('text-[10.5px]', 'font-medium', 'text-mn-text/80', 'tabular-nums')
      expect(event).toHaveClass(
        'rounded-[8px]',
        'bg-mn-drag-ghost',
        'shadow-[0_1px_2px_rgba(40,34,24,.08),0_2px_8px_rgba(40,34,24,.07)]',
        'dark:shadow-[0_1px_2px_rgba(0,0,0,.3),0_2px_8px_rgba(0,0,0,.3)]'
      )
      expect(event.style.height).toBe('22px')
    }

    const { desktop: desk, mobile: phone } = bodies(container)
    const deskAll = desk.querySelector<HTMLElement>('[data-part="calendar-all-day"]')!
    const phoneAll = phone.querySelector<HTMLElement>('[data-part="calendar-all-day"]')!
    expect(deskAll.style.gridTemplateColumns).toBe('52px minmax(0,1fr)')
    expect(phoneAll.style.gridTemplateColumns).toBe('40px minmax(0,1fr)')
    expect(desk.querySelector<HTMLElement>('[data-part="calendar-hour-grid"]')!.style.height).toBe(
      '484px'
    )
    expect(phone.querySelector<HTMLElement>('[data-part="calendar-hour-grid"]')!.style.height).toBe(
      '528px'
    )

    const deskEvent = desk.querySelector<HTMLElement>('[data-part="calendar-timed-event"]')!
    const phoneEvent = phone.querySelector<HTMLElement>('[data-part="calendar-timed-event"]')!
    expect(deskEvent.style.top).toBe('89px')
    expect(phoneEvent.style.top).toBe('97px')

    const deskNow = desk.querySelector<HTMLElement>('[data-part="calendar-now"]')!
    const phoneNow = phone.querySelector<HTMLElement>('[data-part="calendar-now"]')!
    expect(deskNow).toHaveClass('h-[1.4px]', 'bg-mn-text')
    expect(deskNow.querySelector('[data-part="calendar-now-dot"]')).toHaveClass(
      'size-[7px]',
      'bg-mn-text'
    )
    expect(deskNow.style.top).toBe('176px')
    expect(phoneNow.style.top).toBe('192px')
  })

  it('draws the now line only on today, and not once the clock leaves 08:00–19:00', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 21, 12, 0, 0))
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={dayRows} span="day" />
    )
    expect(container.querySelectorAll('[data-part="calendar-now"]')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.getByText('thu 22 oct 2026')).toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-now"]')).toBeNull()
  })

  it('draws no now line when the clock is outside 08:00–19:00', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 21, 20, 0, 0))
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={dayRows} span="day" />
    )
    expect(screen.getByText('wed 21 oct 2026')).toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-now"]')).toBeNull()
    expect(container.querySelector('[data-part="calendar-event-time"]')).toHaveTextContent('10:00')
  })
})

describe('blank click opens the day (KAN-455)', () => {
  const openRows: CollectionRow[] = [
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21' } },
    { id: 'undated', title: 'optician', values: {} },
  ]

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  function cellFor(container: HTMLElement, iso: string) {
    return container.querySelector<HTMLElement>(
      `[data-part="calendar-day-cell"][data-iso="${iso}"]`
    )!
  }

  it('blank click opens the day from the day number or the cell padding', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onConfigChange = jest.fn()
    const { container, unmount } = render(
      <CollectionCalendar schema={schemaWithDate} rows={openRows} onConfigChange={onConfigChange} />
    )

    expect(screen.getByText('october 2026')).toBeInTheDocument()
    await user.click(within(cellFor(container, '2026-10-21')).getByText('21'))

    expect(screen.getByText('wed 21 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
    expect(screen.queryByText('october 2026')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-day-cell"]')).toBeNull()
    const allDay = container.querySelector<HTMLElement>('[data-part="calendar-all-day"]')!
    expect(within(allDay).getByText('dentist')).toBeInTheDocument()
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange).toHaveBeenCalledWith({ span: 'day' })

    unmount()
    onConfigChange.mockClear()
    const padding = render(
      <CollectionCalendar schema={schemaWithDate} rows={openRows} onConfigChange={onConfigChange} />
    )
    fireEvent.click(cellFor(padding.container, '2026-10-22'))

    expect(screen.getByText('thu 22 oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'day' })).toBeChecked()
    expect(onConfigChange).toHaveBeenCalledTimes(1)
    expect(onConfigChange).toHaveBeenCalledWith({ span: 'day' })
  })

  it('blank click opens nothing from the plus, Enter, a record, a drag, or an armed cell, and a mobile dot only moves the focus', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onAddRow = jest.fn().mockResolvedValue('r-new')
    const onMoveDate = jest.fn()
    const onConfigChange = jest.fn()
    const { container, unmount } = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={openRows}
        editable
        onAddRow={onAddRow}
        onRenameRow={jest.fn()}
        onMoveDate={onMoveDate}
        onConfigChange={onConfigChange}
      />
    )

    await user.click(
      within(cellFor(container, '2026-10-21')).getByRole('button', { name: 'Add on 21 oct' })
    )
    expect(onAddRow).toHaveBeenCalledTimes(1)
    expect(onAddRow).toHaveBeenCalledWith({ 'p-due': '2026-10-21' })
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
    expect(screen.getByText('october 2026')).toBeInTheDocument()

    const empty = cellFor(container, '2026-10-22')
    empty.focus()
    await user.keyboard('{Enter}')
    expect(onAddRow).toHaveBeenCalledTimes(2)
    expect(onAddRow).toHaveBeenLastCalledWith({ 'p-due': '2026-10-22' })
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()

    await user.click(within(cellFor(container, '2026-10-21')).getByText('dentist'))
    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
    expect(container.querySelector('[data-part="calendar-day-body"]')).toBeNull()

    await user.click(screen.getByRole('button', { name: '22 oct' }))
    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
    expect(screen.queryByText('thu 22 oct 2026')).not.toBeInTheDocument()
    const focusList = container.querySelector<HTMLElement>('[data-part="calendar-focus-list"]')!
    expect(within(focusList).getByText('thu oct')).toBeInTheDocument()
    expect(within(focusList).queryByText('mon oct · today')).not.toBeInTheDocument()
    expect(container.querySelector('[data-part="calendar-day-body"]')).toBeNull()
    expect(onConfigChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '1 without a date' }))
    await user.click(
      within(screen.getByRole('listbox', { name: 'without a date' })).getByRole('option', {
        name: /optician/,
      })
    )
    await user.click(cellFor(container, '2026-10-23'))
    expect(onMoveDate).toHaveBeenCalledTimes(1)
    expect(onMoveDate).toHaveBeenCalledWith('undated', 'p-due', '2026-10-23')
    expect(onAddRow).toHaveBeenCalledTimes(2)
    expect(screen.getByText('october 2026')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'month' })).toBeChecked()
    expect(container.querySelector('[data-part="calendar-day-cell"]')).not.toBeNull()
    expect(onConfigChange).not.toHaveBeenCalled()
    unmount()

    const DAY_RECTS: Record<string, [number, number, number, number]> = {
      '2026-10-21': [0, 0, 100, 100],
    }
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const iso = this.getAttribute('data-iso')
      const [left, top, right, bottom] = (iso && DAY_RECTS[iso]) || [0, 0, 0, 0]
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this
        },
      } as DOMRect
    })
    const dragChange = jest.fn()
    const dragged = render(
      <CollectionCalendar
        schema={schemaWithDate}
        rows={openRows}
        editable
        onMoveDate={jest.fn()}
        onConfigChange={dragChange}
      />
    )
    const dragCell = cellFor(dragged.container, '2026-10-21')
    const item = within(dragCell).getByText('dentist').closest('div')!
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(item)
    fireEvent.click(dragCell)
    expect(within(dragged.container).getByText('october 2026')).toBeInTheDocument()
    expect(within(dragged.container).getByRole('radio', { name: 'month' })).toBeChecked()
    expect(within(dragged.container).queryByText('wed 21 oct 2026')).not.toBeInTheDocument()
    expect(dragged.container.querySelector('[data-part="calendar-day-cell"]')).not.toBeNull()
    expect(dragChange).not.toHaveBeenCalled()
  })
})

describe('KAN-526 week drag', () => {
  const weekConfig: ViewBlock = { id: 'cal', type: 'view', mode: 'calendar', span: 'week' }
  const weekRows: CollectionRow[] = [
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21T10:00:00' } },
    { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-21' } },
  ]
  /** The pointer-position rect each week column resolves to, keyed by its `data-iso`
   *  (`usePointerBucketDrag` hit-tests the bucket under the pointer by DOM rect).
   *  Any element not named here falls back to jsdom's all-zero rect. */
  const DAY_RECTS: Record<string, [number, number, number, number]> = {
    '2026-10-21': [0, 0, 100, 100],
    '2026-10-22': [200, 0, 300, 100],
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const iso = this.getAttribute('data-iso')
      const [left, top, right, bottom] = (iso && DAY_RECTS[iso]) || [0, 0, 0, 0]
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this
        },
      } as DOMRect
    })
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const columnFor = (container: HTMLElement, iso: string) =>
    container.querySelector<HTMLElement>(`[data-part="calendar-week-column"][data-iso="${iso}"]`)!

  const timedDentist = (container: HTMLElement, iso: string) =>
    within(columnFor(container, iso))
      .getByText('dentist')
      .closest<HTMLElement>('[data-part="calendar-timed-event"]')!

  const weekBody = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-part="calendar-week-body"]')!

  const renderStatic = (
    onMoveDate: (rowId: string, key: string, value: PropertyValue) => void,
    editable = true
  ) =>
    render(
      <CollectionView
        config={weekConfig}
        schema={schemaWithDate}
        rows={weekRows}
        collectionName="tasks"
        editable={editable}
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={onMoveDate}
      />
    )

  const CalendarHarness = ({
    onMoveDate,
  }: {
    onMoveDate: (rowId: string, key: string, value: PropertyValue) => void
  }) => {
    const [rows, setRows] = useState<CollectionRow[]>(weekRows)
    return (
      <CollectionView
        config={weekConfig}
        schema={schemaWithDate}
        rows={rows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={(rowId, key, value) => {
          onMoveDate(rowId, key, value)
          setRows((prev) =>
            prev.map((row) =>
              row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
            )
          )
        }}
      />
    )
  }

  it('dragging dentist from Wednesday onto Thursday writes 2026-10-22T10:00:00 and shows it in that column', () => {
    const onMoveDate = jest.fn()
    const { container } = render(<CalendarHarness onMoveDate={onMoveDate} />)
    const item = timedDentist(container, '2026-10-21')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).toHaveBeenCalledWith('dentist', 'p-due', '2026-10-22T10:00:00')
    const moved = within(columnFor(container, '2026-10-22'))
      .getByText('dentist')
      .closest<HTMLElement>('[data-part="calendar-timed-event"]')
    expect(moved).not.toBeNull()
    if (!moved) return
    expect(within(moved).getByText('10:00')).toBeInTheDocument()
    expect(
      within(columnFor(container, '2026-10-21')).queryByText('dentist')
    ).not.toBeInTheDocument()
  })

  it('a move that stays inside Wednesday’s rect calls nothing', () => {
    const onMoveDate = jest.fn()
    const { container } = renderStatic(onMoveDate)
    const item = timedDentist(container, '2026-10-21')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).not.toHaveBeenCalled()
  })

  it('pointerLeave on the week body after a move onto Thursday calls nothing', () => {
    const onMoveDate = jest.fn()
    const { container } = renderStatic(onMoveDate)
    const item = timedDentist(container, '2026-10-21')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    fireEvent.pointerLeave(weekBody(container))

    expect(onMoveDate).not.toHaveBeenCalled()
  })

  it('editable false, the same sequence, calls nothing', () => {
    const onMoveDate = jest.fn()
    const { container } = renderStatic(onMoveDate, false)
    const item = timedDentist(container, '2026-10-21')

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 250, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).not.toHaveBeenCalled()
  })
})

describe('KAN-526 week all-day drag', () => {
  const weekConfig: ViewBlock = { id: 'cal', type: 'view', mode: 'calendar', span: 'week' }
  const weekRows: CollectionRow[] = [
    { id: 'dentist', title: 'dentist', values: { 'p-due': '2026-10-21T10:00:00' } },
    { id: 'alcove', title: 'confirm alcove', values: { 'p-due': '2026-10-21' } },
  ]
  /** The pointer-position rect each week column resolves to, keyed by its `data-iso`.
   *  The all-day row is not a bucket; a date-only item drops on the column under the pointer. */
  const DAY_RECTS: Record<string, [number, number, number, number]> = {
    '2026-10-21': [0, 0, 100, 100],
    '2026-10-23': [400, 0, 500, 100],
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 19, 12, 0, 0))
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const iso = this.getAttribute('data-iso')
      const [left, top, right, bottom] = (iso && DAY_RECTS[iso]) || [0, 0, 0, 0]
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        x: left,
        y: top,
        toJSON() {
          return this
        },
      } as DOMRect
    })
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  const columnFor = (container: HTMLElement, iso: string) =>
    container.querySelector<HTMLElement>(`[data-part="calendar-week-column"][data-iso="${iso}"]`)!

  const allDayRow = (container: HTMLElement) =>
    container.querySelector<HTMLElement>(
      '[data-part="calendar-week-body"] [data-part="calendar-all-day"]'
    )!

  const alcoveItem = (container: HTMLElement) =>
    within(allDayRow(container))
      .getByText('confirm alcove')
      .closest<HTMLElement>('[data-part="calendar-all-day-item"]')!

  const renderStatic = (onMoveDate: (rowId: string, key: string, value: PropertyValue) => void) =>
    render(
      <CollectionView
        config={weekConfig}
        schema={schemaWithDate}
        rows={weekRows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={onMoveDate}
      />
    )

  const CalendarHarness = ({
    onMoveDate,
  }: {
    onMoveDate: (rowId: string, key: string, value: PropertyValue) => void
  }) => {
    const [rows, setRows] = useState<CollectionRow[]>(weekRows)
    return (
      <CollectionView
        config={weekConfig}
        schema={schemaWithDate}
        rows={rows}
        collectionName="tasks"
        editable
        onConfigChange={jest.fn()}
        onEdit={jest.fn()}
        onMoveDate={(rowId, key, value) => {
          onMoveDate(rowId, key, value)
          setRows((prev) =>
            prev.map((row) =>
              row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
            )
          )
        }}
      />
    )
  }

  it('dragging confirm alcove from Wednesday onto Friday writes 2026-10-23 and keeps it in the all-day row', () => {
    const onMoveDate = jest.fn()
    const { container } = render(<CalendarHarness onMoveDate={onMoveDate} />)
    const item = alcoveItem(container)

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 450, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).toHaveBeenCalledWith('alcove', 'p-due', '2026-10-23')
    expect(onMoveDate.mock.calls[0][2]).not.toMatch(/T/)

    const allDay = allDayRow(container)
    const title = within(allDay).getByText('confirm alcove')
    const moved = title.closest<HTMLElement>('[data-part="calendar-all-day-item"]')
    expect(moved).not.toBeNull()
    if (!moved) return
    expect(moved.style.gridColumn).toBe(columnFor(container, '2026-10-23').style.gridColumn)
    expect(title.closest('[data-part="calendar-timed-event"]')).toBeNull()

    const wednesdayColumn = columnFor(container, '2026-10-21').style.gridColumn
    const stillOnWednesday = Array.from(
      allDay.querySelectorAll<HTMLElement>('[data-part="calendar-all-day-item"]')
    ).filter((el) => el.style.gridColumn === wednesdayColumn)
    expect(stillOnWednesday.some((el) => el.textContent?.includes('confirm alcove'))).toBe(false)
  })

  it('a drop that stays inside Wednesday’s rect calls nothing', () => {
    const onMoveDate = jest.fn()
    const { container } = renderStatic(onMoveDate)
    const item = alcoveItem(container)

    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(item, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(item)

    expect(onMoveDate).not.toHaveBeenCalled()
  })
})
