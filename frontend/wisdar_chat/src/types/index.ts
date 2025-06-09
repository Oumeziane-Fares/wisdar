// This file will be the single source of truth for our data structures.

export interface AiModel {
  id: string;
  display_name: string; // The backend sends display_name
  name?: string; // The frontend can add a translated name
}

export interface Attachment {
  fileName: string;
  fileType: string; 
  fileURL: string;
}

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string | number;
  content: string; 
  role: MessageRole;
  timestamp: string;
  attachment?: Attachment; 
}

export interface Conversation {
  id: string | number;
  title: string;
  created_at: string;
  messages: Message[]; 
  active?: boolean;
  aiModelId: string; 
}

// This interface should match what your /api/login endpoint returns for a user
export interface User {
  id: number;
  full_name: string;
  email: string;
  role: 'user' | 'admin';
  assigned_models: AiModel[]; // This array comes from the backend
}