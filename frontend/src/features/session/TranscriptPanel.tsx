import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { TranscriptBubble } from './TranscriptBubble';
import type { TranscriptBubbleData } from './types';

interface TranscriptPanelProps {
  messages: TranscriptBubbleData[];
  /** 3-dot typing indicator while the AI's turn has started but no text has arrived yet. */
  typing: boolean;
  /**
   * 3-dot placeholder on the user's side while their speech is being
   * captured but hasn't settled into a final bubble yet (Fase 3 liveness:
   * server transcript deltas lag too far behind to render live, so we show
   * "captured, text pending" instead of a real-time — but wrong — caption).
   */
  userTyping: boolean;
}

/** Persistent right-column transcript panel (handoff §4 "Klasik" variant). */
export function TranscriptPanel({ messages, typing, userTyping }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, userTyping]);

  const empty = messages.length === 0 && !typing && !userTyping;

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
          <TranscriptBubble key={i} role={m.role} text={m.text} />
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
        {userTyping && (
          <div className="flex animate-fade-up items-center gap-[5px] self-end rounded-[14px_14px_4px_14px] bg-blue px-4 py-[13px]">
            <span
              className="h-[7px] w-[7px] rounded-full bg-white/70"
              style={{ animation: 'blink 1.2s infinite 0s' }}
            />
            <span
              className="h-[7px] w-[7px] rounded-full bg-white/70"
              style={{ animation: 'blink 1.2s infinite .2s' }}
            />
            <span
              className="h-[7px] w-[7px] rounded-full bg-white/70"
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
