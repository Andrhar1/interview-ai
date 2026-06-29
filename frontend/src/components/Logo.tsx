import { Mic } from 'lucide-react';

interface LogoProps {
  /** Mark background color. Navy on light surfaces, blue on the navy navbar. */
  markColor?: 'navy' | 'blue';
}

/** InterviewAI wordmark: rounded square mic glyph + name. */
export function Logo({ markColor = 'navy' }: LogoProps) {
  const bg = markColor === 'navy' ? 'bg-navy' : 'bg-blue';
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex items-center justify-center rounded-[7px] ${bg}`} style={{ width: 26, height: 26 }}>
        <Mic size={15} color="#fff" strokeWidth={2.2} />
      </div>
      <span className="text-base font-semibold tracking-[-0.01em] text-ink">InterviewAI</span>
    </div>
  );
}
