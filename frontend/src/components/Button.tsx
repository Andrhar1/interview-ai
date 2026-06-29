import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'outline' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 rounded-[8px] font-medium cursor-pointer transition-colors disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // Navy primary (e.g. "Mulai Sesi Wawancara")
  primary: 'bg-navy text-white hover:bg-[#0a2b54] disabled:bg-[#e5e7eb] disabled:text-ink-muted',
  // Blue accent CTA (e.g. "Mulai Sekarang")
  accent: 'bg-blue text-white hover:bg-[#1d4ed8]',
  // Outline (e.g. "Masuk")
  outline: 'bg-transparent border border-border-input text-ink hover:bg-page',
  danger: 'bg-danger text-white hover:bg-[#b91c1c]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'accent', className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
