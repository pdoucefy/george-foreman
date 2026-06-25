import type { LucideIcon, LucideProps } from 'lucide-react';
import React from 'react';

// Tree-shaking note: callers import specific icons from 'lucide-react' and pass
// them to this helper. This avoids importing the full icon set, keeping the
// renderer bundle small. Usage: const SearchIcon = icon(Search)
export const icon =
  (LucideIcon: LucideIcon) =>
  ({ size = 16, strokeWidth = 1.5, ...props }: LucideProps): React.ReactElement => (
    <LucideIcon size={size} strokeWidth={strokeWidth} {...props} />
  );
