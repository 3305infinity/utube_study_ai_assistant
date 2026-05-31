import { create } from 'zustand';
import type { ChatCitation, ChatMessage } from '@/types/ai';

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  addUserMessage: (content: string) => string;
  addAssistantPlaceholder: () => string;
  finalizeAssistant: (id: string, content: string, citations?: ChatCitation[]) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

let msgCounter = 0;
function newId(): string {
  return `msg_${Date.now()}_${++msgCounter}`;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  loading: false,
  error: null,

  addUserMessage: (content) => {
    const id = newId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, timestamp: Date.now() }],
      error: null,
    }));
    return id;
  },

  addAssistantPlaceholder: () => {
    const id = newId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'assistant', content: '', timestamp: Date.now() }],
      loading: true,
    }));
    return id;
  },

  finalizeAssistant: (id, content, citations) => {
    set((s) => ({
      loading: false,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content, citations } : m
      ),
    }));
  },

  setError: (error) => set({ error, loading: false }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ messages: [], loading: false, error: null }),
}));
