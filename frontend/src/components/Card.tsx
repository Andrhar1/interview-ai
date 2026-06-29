import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** White surface, 1px border, 12px radius — the base panel of the system. */
export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
