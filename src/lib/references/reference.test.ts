import { reanchorRange } from './reference'

describe('reanchorRange', () => {
  it('shifts the range forward when text is inserted before it', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 0, deleteCount: 0, insertedText: 'hello ' }

    expect(reanchorRange(range, edit)).toEqual({ from: 16, to: 26 })
  })

  it('grows the range when text is inserted inside it', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 15, deleteCount: 0, insertedText: 'more ' }

    expect(reanchorRange(range, edit)).toEqual({ from: 10, to: 25 })
  })

  it('leaves the range untouched when the edit is after it', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 20, deleteCount: 0, insertedText: 'after' }

    expect(reanchorRange(range, edit)).toEqual({ from: 10, to: 20 })
  })

  it('shifts the range back when text before it is deleted', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 0, deleteCount: 5, insertedText: '' }

    expect(reanchorRange(range, edit)).toEqual({ from: 5, to: 15 })
  })

  it('leaves the range untouched when text after it is deleted', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 25, deleteCount: 5, insertedText: '' }

    expect(reanchorRange(range, edit)).toEqual({ from: 10, to: 20 })
  })

  it('drops the range when a delete straddles its start', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 5, deleteCount: 10, insertedText: '' }

    expect(reanchorRange(range, edit)).toBeNull()
  })

  it('drops the range when a delete covers it entirely', () => {
    const range = { from: 10, to: 20 }
    const edit = { from: 0, deleteCount: 30, insertedText: '' }

    expect(reanchorRange(range, edit)).toBeNull()
  })
})
