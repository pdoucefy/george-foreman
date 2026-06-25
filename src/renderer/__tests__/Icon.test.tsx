import { icon } from '@renderer/components/ui/Icon';
import { render } from '@testing-library/react';

import { Search, X } from 'lucide-react';

describe('icon helper', () => {
  it('renders the wrapped lucide icon', () => {
    const SearchIcon = icon(Search);
    const { container } = render(<SearchIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies default size of 16', () => {
    const SearchIcon = icon(Search);
    const { container } = render(<SearchIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });

  it('applies default strokeWidth of 1.5', () => {
    const SearchIcon = icon(Search);
    const { container } = render(<SearchIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
  });

  it('allows overriding size', () => {
    const XIcon = icon(X);
    const { container } = render(<XIcon size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
  });

  it('tree-shakes: each icon is a separate component', () => {
    const SearchIcon = icon(Search);
    const XIcon = icon(X);
    expect(SearchIcon).not.toBe(XIcon);
  });
});
