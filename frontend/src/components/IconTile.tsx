import type { ReactNode } from 'react';

interface IconTileProps {
  children: ReactNode;
  size?: number;
  className?: string;
}

/** Square rounded icon background (handoff: 40×40, bg #f1f5f9, navy icon). */
export function IconTile({ children, size = 40, className = '' }: IconTileProps) {
  return (
    <div
      className={`flex items-center justify-center bg-tile rounded-tile shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}
