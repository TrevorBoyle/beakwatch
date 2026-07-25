import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('../BirdImage.jsx', () => ({ default: ({ alt }) => <img alt={alt} /> }))
vi.mock('../../utils/wikipedia.js', () => ({
  fetchWikipedia: vi.fn().mockResolvedValue({ extract: 'A small passerine bird.', photoUrl: null, attribution: null }),
}))

import BirdProfile, { ClampedExtract } from './BirdProfile.jsx'

afterEach(() => {
  vi.restoreAllMocks()
})

const detections = [{
  commonName: 'Eurasian Wren',
  scientificName: 'Troglodytes troglodytes',
  confidence: 0.95,
  timestamp: new Date().toISOString(),
}]

const todayStats = [
  { commonName: 'Eurasian Wren', hour: 8, count: 3 },
  { commonName: 'Eurasian Wren', hour: 9, count: 7 },
]

describe('BirdProfile', () => {
  it('renders the species name and scientific name', () => {
    render(<BirdProfile detections={detections} todayStats={todayStats} />)
    expect(screen.getByText('Eurasian Wren')).toBeInTheDocument()
    expect(screen.getByText('Troglodytes troglodytes')).toBeInTheDocument()
  })

  it('renders the Species Profile badge with a relative timestamp', () => {
    render(<BirdProfile detections={detections} todayStats={todayStats} />)
    expect(screen.getByText(/Species Profile.*just now/)).toBeInTheDocument()
  })

  it('renders today total and peak hour stats', () => {
    render(<BirdProfile detections={detections} todayStats={todayStats} />)
    expect(screen.getByText('10')).toBeInTheDocument() // 3 + 7
    expect(screen.getByText('detections last 24hrs')).toBeInTheDocument()
    expect(screen.getByText('9:00')).toBeInTheDocument() // peak hour
  })

  it('renders without crashing when todayStats is empty', () => {
    render(<BirdProfile detections={detections} todayStats={[]} />)
    expect(screen.getByText('Eurasian Wren')).toBeInTheDocument()
  })

  it('renders the avg. confidence tile when history has a confidence entry for the featured species', () => {
    const history = { confidenceBySpecies: { 'Eurasian Wren': 0.82 } }
    render(<BirdProfile detections={detections} todayStats={todayStats} history={history} />)
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.getByText('avg. confidence')).toBeInTheDocument()
    expect(screen.getByText('82%')).toHaveClass('text-forest')
  })

  it('color-codes the confidence tile orange below 70% and a darker orange below 50%', () => {
    const { rerender } = render(
      <BirdProfile detections={detections} todayStats={todayStats} history={{ confidenceBySpecies: { 'Eurasian Wren': 0.6 } }} />
    )
    expect(screen.getByText('60%')).toHaveClass('text-amber')

    rerender(
      <BirdProfile detections={detections} todayStats={todayStats} history={{ confidenceBySpecies: { 'Eurasian Wren': 0.4 } }} />
    )
    expect(screen.getByText('40%')).toHaveClass('text-amber-dark')
  })

  it('omits the avg. confidence tile when history has no entry for the featured species', () => {
    render(<BirdProfile detections={detections} todayStats={todayStats} history={{ confidenceBySpecies: {} }} />)
    expect(screen.queryByText('avg. confidence')).not.toBeInTheDocument()
  })

  it('renders nothing when there is no data at all', () => {
    const { container } = render(<BirdProfile detections={[]} todayStats={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('drops trailing sentences that overflow the available box, without cropping mid-sentence', () => {
    // jsdom does no real layout, so clientHeight/scrollHeight are always 0.
    // Simulate a box that only has room for ~2 sentences by stubbing
    // scrollHeight to grow with each rendered <p> and clientHeight (read off
    // the parent) to a fixed budget.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(150)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
      return this.querySelectorAll('p').length * 60
    })

    const longExtract = 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.'
    render(
      <div style={{ height: 150 }}>
        <ClampedExtract extract={longExtract} />
      </div>
    )

    expect(screen.getByText('First sentence here.')).toBeInTheDocument()
    expect(screen.getByText('Second sentence here.')).toBeInTheDocument()
    expect(screen.queryByText('Third sentence here.')).not.toBeInTheDocument()
    expect(screen.queryByText('Fourth sentence here.')).not.toBeInTheDocument()
  })
})
