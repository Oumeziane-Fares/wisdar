// frontend/wisdar_chat/src/types/index.ts

/**
 * AI Model Definition
 * 
 * Represents an AI model available in the system
 */
export interface AiModel {
  id: string;                    // Unique model identifier (e.g., "gemini-1.5-pro")
  display_name: string;          // Model name shown to users
  name?: string;                 // Optional localized/translated name
  description?: string;          // Optional model description
  capabilities?: string[];       // Optional capabilities (e.g., ["text", "vision"])
}

/**
 * File Attachment Definition
 * 
 * Represents a file attached to a message
 */
export interface Attachment {
  fileName: string;              // Original filename
  fileType: string;              // MIME type (e.g., "audio/wav")
  fileURL: string;               // URL to access the file
  fileSize?: number;             // Optional file size in bytes
  duration?: number;             // Optional duration for audio/video (seconds)
  transcription?: string;        // Optional transcription for audio files
}

/**
 * Message Role Type
 * 
 * Specifies the author of a message
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Message Status Type
 * 
 * Tracks the current state of a message in the UI
 */
export type MessageStatus = 
  | 'complete'       // Message is fully processed
  | 'thinking'       // AI is generating a response
  | 'transcribing'   // Audio is being transcribed
  | 'streaming'      // AI response is being streamed
  | 'error';         // An error occurred processing the message

/**
 * Message Interface
 * 
 * Represents a single message in a conversation
 */
export interface Message {
  id: string | number;           // Unique message identifier
  content: string;               // Text content of the message
  role: MessageRole;             // Author of the message
  timestamp: string;             // ISO 8601 timestamp of creation
  status?: MessageStatus;        // Current processing state
  
  // Optional attachment for media messages
  attachment?: Attachment; 
  
  // Optional conversation reference
  conversation_id?: string | number;
  
  // Optional error information
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Conversation Interface
 * 
 * Represents a chat conversation
 */
export interface Conversation {
  id: string | number;           // Unique conversation identifier
  title: string;                 // Conversation title
  created_at: string;            // ISO 8601 creation timestamp
  messages: Message[];           // Messages in the conversation
  aiModelId: string;             // ID of the active AI model
  
  // UI state properties
  active?: boolean;              // Is this the active conversation?
  unreadCount?: number;          // Optional unread message count
  lastMessage?: string;          // Optional preview of last message
  lastMessageTime?: string;      // Optional timestamp of last message
  
  // Optional metadata
  tags?: string[];               // Optional conversation tags
  userId?: number;               // Optional user ID for multi-user systems
}

/**
 * User Interface
 * 
 * Represents an application user
 */
export interface User {
  id: number; // Updated to 'number' as per your latest request
  full_name: string; // User's full name
  email: string; // User's email address
  role: 'user' | 'admin'; // User's system role
  // AI models assigned to this user
  assigned_models: AiModel[];
  // Optional metadata
  avatar_url?: string; // Optional profile picture URL
  last_active?: string; // Optional last active timestamp
  preferences?: { // Optional user preferences
    language?: string;
    theme?: 'light' | 'dark';
  };
}

/**
 * SSE Event Types
 * 
 * Defines the structure of Server-Sent Events
 */
export type SseEvent = 
  | {
      type: 'transcription_complete';
      message_id: string | number;
      content: string;
    }
  | {
      type: 'stream_start';
      message: Message;
    }
  | {
      type: 'stream_chunk';
      message_id: string | number;
      content: string;
    }
  | {
      type: 'stream_end';
      message_id: string | number;
    }
  | {
      type: 'error';
      message_id: string | number;
      error: string;
    };

/**
 * API Response Structure
 * 
 * Standard format for API responses
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}