import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Labelled text input. Border turns red (#fca5a5) when `error` is set. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', id, ...props },
  ref,
) {
  const inputId = id ?? props.name ?? label;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        ref={ref}
        className={`w-full rounded-[8px] border bg-surface px-3.5 py-[11px] text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-blue ${
          error ? 'border-[#fca5a5]' : 'border-border-input'
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
});
