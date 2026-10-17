import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionCalendar } from './collection-calendar'
import { CALENDAR_EMPTY_LINE } from './kinds'
import { localDateIso } from './due'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from './apply'

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
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
      expect(within(desktopWrap).getByText('first')).toBeInTheDocument()
      expect(within(desktopWrap).getByText('second')).toBeInTheDocument()
      expect(within(desktopWrap).getByText('third')).toBeInTheDocument()
      expect(within(desktopWrap).queryByText('fourth')).not.toBeInTheDocument()
      expect(within(desktopWrap).getByText('＋1 more')).toBeInTheDocument()
    })

    it("today's cell carries the orange chip", () => {
      const { container } = render(<CollectionCalendar schema={schemaWithDate} rows={rows} />)
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
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
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
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
      const grids = [...container.querySelectorAll('div')].filter((d) => d.classList.contains('grid-cols-7'))
      const mobileGrid = grids.find((g) => g.classList.contains('md:hidden'))
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))
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
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
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
      return container.querySelector<HTMLElement>(`[data-part="calendar-day-cell"][data-iso="${iso}"]`)!
    }

    it('clicking a day’s blank area, typing and ↵ adds that day’s record then closes the input', async () => {
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

      await user.click(cellFor(container, '2026-09-20'))
      const input = screen.getByRole('textbox', { name: 'Add an item on 20 sep' })
      await user.type(input, 'dentist{Enter}')

      expect(onAddRow).toHaveBeenCalledWith({ 'p-due': '2026-09-20' })
      expect(onRenameRow).toHaveBeenCalledWith('r-new', 'dentist')
      expect(screen.queryByRole('textbox', { name: 'Add an item on 20 sep' })).not.toBeInTheDocument()
    })

    it('clicking an existing day-item row never opens the input (stopPropagation on MonthDayStack)', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onAddRow = jest.fn().mockResolvedValue('r-new')
      const { container } = render(
        <CollectionCalendar schema={schemaWithDate} rows={rows} editable onAddRow={onAddRow} onRenameRow={jest.fn()} />
      )

      await user.click(within(cellFor(container, '2026-09-10')).getByText('Trim the rim'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(onAddRow).not.toHaveBeenCalled()
    })

    it('Esc after opening calls neither addRow nor onRenameRow', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onAddRow = jest.fn().mockResolvedValue('r-new')
      const onRenameRow = jest.fn()
      const { container } = render(
        <CollectionCalendar schema={schemaWithDate} rows={[]} editable onAddRow={onAddRow} onRenameRow={onRenameRow} />
      )

      await user.click(cellFor(container, '2026-09-20'))
      const input = screen.getByRole('textbox', { name: 'Add an item on 20 sep' })
      await user.type(input, 'nope{Escape}')

      expect(onAddRow).not.toHaveBeenCalled()
      expect(onRenameRow).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('not editable (or no date property) draws no clickable cell at all', () => {
      const { container: notEditable } = render(
        <CollectionCalendar schema={schemaWithDate} rows={[]} onAddRow={jest.fn()} onRenameRow={jest.fn()} />
      )
      expect(cellFor(notEditable, '2026-09-20')).not.toHaveAttribute('role', 'button')

      const { container: noDate } = render(
        <CollectionCalendar schema={schemaNoDate} rows={rows} editable onAddRow={jest.fn()} onRenameRow={jest.fn()} />
      )
      expect(noDate.querySelector('[data-part="calendar-day-cell"][role="button"]')).toBeNull()
    })
  })
})
