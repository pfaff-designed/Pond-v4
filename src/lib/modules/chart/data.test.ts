import { toCategoricalChartRows, toChartRows } from './data'

describe('toCategoricalChartRows (#94)', () => {
  const points = [
    { x: 'Done', values: { Records: 2 } },
    { x: 'Open', values: { Records: 1 } },
  ]

  it('gives each category an ordinal x and carries the label separately', () => {
    expect(toCategoricalChartRows(points)).toEqual([
      { x: 0, xLabel: 'Done', Records: 2 },
      { x: 1, xLabel: 'Open', Records: 1 },
    ])
    // Every ordinal is a valid instant for the time-series shell.
    for (const row of toCategoricalChartRows(points)) expect(Number.isNaN(new Date(row.x as number).getTime())).toBe(false)
  })

  it('leaves the date-axis shape untouched', () => {
    expect(toChartRows(points)[0]).toEqual({ x: 'Done', Records: 2 })
  })
})
