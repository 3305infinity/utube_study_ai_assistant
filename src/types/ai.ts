/**
 * AI-related type definitions
 */

export interface SemanticChunk {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  embedding: number[] | null;
  transcriptChunkIds: string[];
  /** Set when indexed as part of a YouTube playlist */
  videoId?: string;
  videoTitle?: string;
  playlistId?: string;
}

export type EmbeddingVector = number[];

export interface VectorSearchResult {
  chunk: SemanticChunk;
  similarity: number;
  rank: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  citations?: ChatCitation[];
}

export interface ChatCitation {
  id: string;
  chunkId: string;
  startTime: number;
  endTime: number;
  excerpt: string;
  similarityScore: number;
  videoId?: string;
  videoTitle?: string;
}

export interface PlaylistInfo {
  playlistId: string;
  title: string;
  videoIds: string[];
}

export type StudyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface StudySegment {
  id: string;
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  videoId: string;
  videoTitle?: string;
  watched?: boolean;
}

export interface StudyRetrievalEvidence {
  chunkId: string;
  videoId: string;
  videoTitle?: string;
  startTime: number;
  endTime: number;
  excerpt: string;
  score: number;
}

export interface StudyConceptNode {
  id: string;
  label: string;
  children?: StudyConceptNode[];
}

export interface StudyQuickQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface StudyMasteryBreakdown {
  percent: number;
  quizCorrect: number;
  quizTotal: number;
  flashcardsReviewed: number;
  flashcardsTotal: number;
  segmentsWatched: number;
  segmentsTotal: number;
  revisionSessions: number;
}

export interface StudyPlan {
  id: string;
  playlistId: string;
  topic: string;
  level: StudyLevel;
  estimatedMinutes: number;
  prerequisites: string[];
  segments: StudySegment[];
  keyConcepts: string[];
  interviewQuestions: string[];
  conceptMap: StudyConceptNode[];
  retrievalEvidence: StudyRetrievalEvidence[];
  nextTopics: string[];
  notesPreview: string;
  quickQuiz: StudyQuickQuestion[];
  mastery: StudyMasteryBreakdown;
  watchedSegmentIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AIResponse {
  content: string;
  relevantChunks: SemanticChunk[];
  tokensUsed?: number;
  model: string;
}

export interface ChunkingOptions {
  maxChunkSize: number;
  minChunkSize: number;
  overlapSize: number;
  respectSentences: boolean;
  respectParagraphs: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  summary: string;
  keyPoints: string[];
}

export interface Flashcard {
  id: string;
  videoId: string;
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
  nextReviewDate: number;
  interval: number;
  repetitions: number;
  easeFactor: number;
  createdAt: number;
  lastReviewed?: number;
}

export interface QuizQuestion {
  id: string;
  videoId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timestamp?: number;
}

export type AIGenerationStatus = 'idle' | 'generating' | 'success' | 'error';

export interface ConfusionZone {
  startTime: number;
  endTime: number;
  score: number;
  reasons: string[];
}

export interface HeatmapBucket {
  startTime: number;
  endTime: number;
  density: number;
}
