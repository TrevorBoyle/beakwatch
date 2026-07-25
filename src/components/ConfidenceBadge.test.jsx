import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import ConfidenceBadge from './ConfidenceBadge.jsx'

describe('ConfidenceBadge', () => {
  it('renders nothing when value is null or undefined', () => {
    const { container: a } = render(<ConfidenceBadge value={null} />)
    const { container: b } = render(<ConfidenceBadge value={undefined} />)
    expect(a).toBeEmptyDOMElement()
    expect(b).toBeEmptyDOMElement()
  })

  it('renders the rounded percentage', () => {
    render(<ConfidenceBadge value={0.876} />)
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('colors 70%+ green', () => {
    render(<ConfidenceBadge value={0.7} />)
    expect(screen.getByText('70%')).toHaveClass('bg-forest-soft', 'text-forest')
  })

  it('colors 50-69% orange', () => {
    render(<ConfidenceBadge value={0.5} />)
    expect(screen.getByText('50%')).toHaveClass('bg-amber-soft', 'text-amber')
  })

  it('colors below 50% a darker orange', () => {
    render(<ConfidenceBadge value={0.49} />)
    expect(screen.getByText('49%')).toHaveClass('bg-amber-dark-soft', 'text-amber-dark')
  })
})
