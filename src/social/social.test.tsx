import { readdirSync, readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LeaderboardScreen } from './components/LeaderboardScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { PodiumScreen } from './components/PodiumScreen'
import { RaceScreen } from './components/RaceScreen'
import { FAMILY_BOARD, FAMILY_LOBBY, FAMILY_PODIUM, FAMILY_RACE, FAMILY_RACE_QUESTION } from './fixtures'

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return found
  }
  for (const name of names) {
    const path = `${dir}/${name}`
    if (name.endsWith('.ts') || name.endsWith('.tsx')) found.push(path)
    else found.push(...sourceFiles(path))
  }
  return found
}

describe('social fixtures', () => {
  it('renders the family board, lobby, race, and podium from fixtures', () => {
    const board = renderToStaticMarkup(<LeaderboardScreen entries={FAMILY_BOARD} />)
    expect(board.indexOf('Mikaela')).toBeLessThan(board.indexOf('Noa'))
    expect(board.indexOf('Noa')).toBeLessThan(board.indexOf('Sam'))
    expect(board).toContain('Multiplication')
    expect(board).toContain('Level 7')
    expect(board).toContain('Rush 100')
    expect(board).toContain('Family board')
    expect(board).toContain('Not finished')
    expect(board).not.toContain('global')

    const lobby = renderToStaticMarkup(<LobbyScreen lobby={FAMILY_LOBBY} />)
    expect(lobby).toContain('482 917')
    expect(lobby).toContain('Host')
    expect(lobby).toContain('Not ready')
    expect(lobby).toContain('not live')

    const race = renderToStaticMarkup(<RaceScreen race={FAMILY_RACE} question={FAMILY_RACE_QUESTION} />)
    expect(race).toContain('7 × 8')
    expect(race).toContain('data-answer-type="multiple-choice"')
    expect(race).toContain('You')
    expect(race.match(/class="mr-pip on"/g)).toHaveLength(2)

    const podium = renderToStaticMarkup(<PodiumScreen podium={FAMILY_PODIUM} />)
    expect(podium.indexOf('Mikaela')).toBeLessThan(podium.indexOf('Noa'))
    expect(podium).toContain('not saved')
    expect(podium).not.toContain('x1.5')
    expect(podium).not.toContain('XP')
  })

  it('keeps social code out of the learning engine and off the network', () => {
    const engine = sourceFiles(decodeURIComponent(new URL('../engine', import.meta.url).pathname))
    expect(engine.length).toBeGreaterThan(10)
    for (const file of engine) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toContain('src/social')
      expect(source).not.toMatch(/from ['"][^'"]*social/)
    }
    const social = sourceFiles(decodeURIComponent(new URL('.', import.meta.url).pathname)).filter(
      (file) => !file.includes('.test.'),
    )
    const banned = /fetch\(|WebSocket|firebase|supabase|XMLHttpRequest|sendBeacon|fonts\.googleapis/
    for (const file of social) {
      expect(readFileSync(file, 'utf8')).not.toMatch(banned)
    }
  })
})
