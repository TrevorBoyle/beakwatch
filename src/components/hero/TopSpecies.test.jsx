import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../BirdImage.jsx', () => ({
  default: ({ alt }) => <img alt={alt} />,
}))

import TopSpecies from './TopSpecies.jsx'

const species = [
  { commonName: 'Eurasian Wren', count: 200 },
  { commonName: 'Robin', count: 150 },
]

describe('TopSpecies', () => {
  it('renders the given title', () => {
    render(<TopSpecies species={species} title="Most Popular Species: 30 Days" />)
    expect(screen.getByText('Most Popular Species: 30 Days')).toBeInTheDocument()
  })

  it('renders species names with counts', () => {
    render(<TopSpecies species={species} title="Most Popular Species: 24 hours" />)
    expect(screen.getByText('Eurasian Wren')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('shows rank numbers', () => {
    render(<TopSpecies species={species} title="Most Popular Species: 30 Days" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
