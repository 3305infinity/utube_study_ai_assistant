/**
 * Notes type definitions
 */

export type NoteType =
  | 'concise'
  | 'detailed'
  | 'interview'
  | 'revision'
  | 'implementation'
  | 'contest'
  | 'custom';

export interface Note {
  id: string;
  videoId: string;
  type: NoteType;
  title: string;
  content: string;
  format: 'markdown' | 'plain';
  tags: string[];
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  timestampAnchors?: Array<{ startTime: number; endTime?: number; label?: string }>;
}
