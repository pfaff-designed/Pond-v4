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
      const occupied = within(cellFor(container, '2026-09-10')).getByText('Trim the rim').closest('div')!
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

      fireEvent.click(cell)
      await user.click(within(cell).getByText('20'))
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

      await user.click(within(cellFor(container, iso)).getByRole('button', { name: 'Add on 20 sep' }))
      await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      })

      const item = cellFor(container, iso).querySelector<HTMLElement>('[data-row-id="r-new"]')
      expect(item).toHaveClass('ring-[1.5px]', 'ring-inset', 'ring-mn-text')
      expect(screen.getByLabelText('Record: Untitled')).toBeInTheDocument()
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Record title' }))
      expect(screen.getByRole('button', { name: 'Due value' })).toHaveTextContent(formatAtomDate(iso))
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

      await user.click(within(cellFor(container, iso)).getByRole('button', { name: 'Add on 20 sep' }))
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
        <CollectionCalendar schema={schemaWithDate} rows={rows} editable onAddRow={onAddRow} onRenameRow={jest.fn()} />
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
        <CollectionCalendar schema={schemaWithDate} rows={[]} editable onAddRow={onAddRow} onRenameRow={onRenameRow} />
      )

      cellFor(container, '2026-09-20').focus()
      await user.keyboard('{Escape}')

      expect(onAddRow).not.toHaveBeenCalled()
      expect(onRenameRow).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
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
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
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
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
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
      const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
      const item = within(desktopWrap).getByText('Trim the rim').closest('div')!

      await user.click(item)
      expect(onOpenRow).not.toHaveBeenCalled()

      await user.click(item)

      expect(onOpenRow).toHaveBeenCalledWith('r1')
    })
  })

  describe("selecting a day’s event in the mobile focus list (KAN-358)", () => {
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
    return container.querySelector<HTMLElement>(`[data-part="calendar-day-cell"][data-iso="${iso}"]`)!
  }

  it('no day cell is role="button", addable or not', () => {
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={rows} editable onAddRow={jest.fn()} onRenameRow={jest.fn()} />
    )
    expect(container.querySelector('[data-part="calendar-day-cell"][role="button"]')).toBeNull()
  })

  it('an addable day’s "Add on …" button adds that day and does not open an inline input', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onAddRow = jest.fn().mockResolvedValue('r-new')
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={[]} editable onAddRow={onAddRow} onRenameRow={jest.fn()} />
    )
    const addButton = within(cellFor(container, '2026-09-20')).getByRole('button', { name: 'Add on 20 sep' })

    await user.click(addButton)

    expect(onAddRow).toHaveBeenCalledWith({ 'p-due': '2026-09-20' })
    expect(screen.queryByRole('textbox', { name: /Add an item/ })).not.toBeInTheDocument()
  })

  it('an event item sits inside the day cell but outside any role="button"', () => {
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={rows} editable onAddRow={jest.fn()} onRenameRow={jest.fn()} />
    )
    const item = within(cellFor(container, '2026-09-10')).getByText('Trim the rim')
    expect(item.closest('[role="button"]')).toBeNull()
  })

  it('a hovered or focused day cell shows a hand-drawn plus', () => {
    const { container } = render(
      <CollectionCalendar schema={schemaWithDate} rows={[]} editable onAddRow={jest.fn()} onRenameRow={jest.fn()} />
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
    return container.querySelector<HTMLElement>(`[data-part="calendar-day-cell"][data-iso="${iso}"]`)!
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
  function CalendarHarness({ onMoveDate }: { onMoveDate: (rowId: string, key: string, value: PropertyValue) => void }) {
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
    expect(within(cellFor(container, '2026-09-12')).queryByText('Trim the rim')).not.toBeInTheDocument()
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
