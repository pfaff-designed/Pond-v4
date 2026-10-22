import { bugAnswer, bugTitle, composerSkillQuery, parseBugCommand } from './command'

describe('parseBugCommand', () => {
  it('reads the report after /bug', () => {
    expect(parseBugCommand('/bug login 500s when the cookie is missing')).toEqual({
      report: 'login 500s when the cookie is missing',
    })
  })

  it('treats a bare /bug as a command with no report', () => {
    expect(parseBugCommand('  /bug  ')).toEqual({ report: '' })
  })

  it('leaves a word that only starts with bug alone', () => {
    expect(parseBugCommand('/buggy login')).toBeNull()
    expect(parseBugCommand('please /bug this')).toBeNull()
  })
})

describe('composerSkillQuery', () => {
  it('stays open while the skill name is being typed', () => {
    expect(composerSkillQuery('/')).toBe('')
    expect(composerSkillQuery('/bu')).toBe('bu')
    expect(composerSkillQuery('/bug ')).toBe('bug')
  })

  it('closes once the report starts, and when the token is not bug', () => {
    expect(composerSkillQuery('/bug login 500s')).toBeNull()
    expect(composerSkillQuery('/nope')).toBeNull()
    expect(composerSkillQuery('ask pond')).toBeNull()
  })
})

describe('bugTitle', () => {
  it('uses the first line and caps a long one', () => {
    expect(bugTitle('login 500s\n\nhappens on refresh')).toBe('login 500s')
    const long = `${'word '.repeat(40)}tail`
    expect(bugTitle(long).length).toBeLessThanOrEqual(120)
    expect(bugTitle(long).endsWith('tail')).toBe(false)
  })
})

describe('bugAnswer', () => {
  it('names the issue and the transcript when the agent started', () => {
    expect(
      bugAnswer(true, {
        issueUrl: 'https://github.com/pfaff-designed/Pond-v4/issues/12',
        transcriptUrl: 'https://platform.claude.com/workspaces/default/sessions/sesn_1',
      })
    ).toContain('issues/12')
  })

  it('keeps the issue url when the agent did not start', () => {
    expect(
      bugAnswer(false, {
        issueUrl: 'https://github.com/pfaff-designed/Pond-v4/issues/12',
        error: 'down',
      })
    ).toContain('did not start')
  })
})
