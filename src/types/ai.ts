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
