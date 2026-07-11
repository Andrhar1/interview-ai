import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { TranscriptBubble } from './TranscriptBubble';
import type { TranscriptBubbleData } from './types';

interface TranscriptPanelProps {
  messages: TranscriptBubbleData[];
  /** 3-dot typing indicator while the AI's turn has started but no text has arrived yet. */
  typing: boolean;
}

/** Persistent right-column transcript panel (handoff §4 "Klasik" variant). */
export function TranscriptPanel({ messages, typing }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const empty = messages.length === 0 && !typing;

  return (
    <div className="flex max-h-[640px] min-w-[300px] flex-1 flex-col overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4 text-sm font-semibold text-ink">
        <MessageSquare size={16} color="#061f3d" strokeWidth={1.9} />
        Transkrip langsung
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-[280px] flex-1 flex-col gap-3 overflow-y-auto px-[18px] pb-2 pt-[18px]"
      >
        {messages.map((m, i) => (
          <TranscriptBubble key={i} role={m.role} text={m.text} final={m.final} />
        ))}
        {typing && (
          <div className="flex animate-fade-up items-center gap-[5px] self-start rounded-[4px_14px_14px_14px] bg-track px-4 py-[13px]">
            <span
              className="h-[7px] w-[7px] rounded-full bg-ink-muted"
              style={{ animation: 'blink 1.2s infinite 0s' }}
            />
            <span
              className="h-[7px] w-[7px] rounded-full bg-ink-muted"
              style={{ animation: 'blink 1.2s infinite .2s' }}
            />
            <span
              className="h-[7px] w-[7px] rounded-full bg-ink-muted"
              style={{ animation: 'blink 1.2s infinite .4s' }}
            />
          </div>
        )}
        {empty && (
          <div className="m-auto max-w-[220px] px-2.5 py-[30px] text-center text-[13px] text-[#aab0ba]">
            Percakapan akan muncul di sini saat sesi dimulai.
          </div>
        )}
      </div>
    </div>
  );
}
