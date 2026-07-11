import type { TranscriptBubbleData } from './types';

/**
 * AI ("Pewawancara AI" label, left) and User (right) bubbles.
 * The design's third "Feedback" role is intentionally not rendered here —
 * see types.ts for why.
 */
export function TranscriptBubble({ role, text }: TranscriptBubbleData) {
  if (role === 'ai') {
    return (
      <div className="flex max-w-[86%] animate-fade-up flex-col items-start self-start">
        <div className="mb-[5px] text-[11px] font-semibold text-ink-muted">Pewawancara AI</div>
        <div className="rounded-[4px_14px_14px_14px] bg-track px-3.5 py-[11px] text-[13.5px] leading-[1.5] text-[#1f2937]">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[86%] animate-fade-up self-end">
      <div className="rounded-[14px_14px_4px_14px] bg-blue px-3.5 py-[11px] text-[13.5px] leading-[1.5] text-white">
        {text}
      </div>
    </div>
  );
}
