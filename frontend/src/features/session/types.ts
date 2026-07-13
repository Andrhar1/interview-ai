/** Shared UI types for the live Session screen (Task 5). */

export type SpeakerState = 'ai' | 'user' | 'thinking' | 'idle';

export type MicState = 'disabled' | 'unmuted' | 'muted' | 'denied';

/**
 * A transcript bubble. Fase 3 renders all AI speech as the "AI" role — the
 * design's separate "Feedback" bubble role is hard to distinguish from
 * question text in raw Gemini transcription, so that role is skipped here
 * (see TranscriptBubble.tsx).
 */
export interface TranscriptBubbleData {
  role: 'ai' | 'user';
  text: string;
  final: boolean;
}
