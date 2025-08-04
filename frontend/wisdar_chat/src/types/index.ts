// frontend/wisdar_chat/src/types/index.ts
import { LucideIcon } from "lucide-react";
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
export enum MessageStatus {
  COMPLETE = 'complete',
  THINKING = 'thinking',
  EXTRACTING_AUDIO = 'extracting_audio', // <-- Add this
  TRANSCRIBING = 'transcribing',
  STREAMING = 'streaming',
  ERROR = 'error',
  FAILED = 'failed', // Added from your previous task file
  UPLOADING = 'uploading',   // NEW: For when a file is being sent
  WAITING = 'waiting'       // NEW: For after upload, before transcription starts

}
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
  
  // --- ADD THIS NEW PROPERTY ---
  uploadProgress?: number; // Optional progress for file uploads (0-100)
  // -----------------------------

  // Optional attachment for media messages
  attachment?: Attachment; 
  
  // Optional conversation reference
  conversation_id?: string | number;
  
  // Optional error information
  error?: {
    code: string;
    message: string;
  };
  imageUrl?: string; // For generated images

  // --- START: ADD THESE TWO LINES ---
  job_status?: string | null;
  job_metadata?: any;
  // --- END: ADD THESE TWO LINES ---
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
    // --- ADD THIS NEW PROPERTY ---
  providerId?: string;           // Optional ID of the AI provider (e.g., 'openai')
  service_id?: string;     
  // -----------------------------
  // UI state properties
  active?: boolean;              // Is this the active conversation?
  unreadCount?: number;          // Optional unread message count
  lastMessage?: string;          // Optional preview of last message
  lastMessageTime?: string;      // Optional timestamp of last message
  // --- ADD THIS NEW PROPERTY ---
  is_pinned?: boolean;          // Is this conversation pinned to the top?
  isAgentConversation?: boolean; 
  // -----------------------------
  // Optional metadata
  tags?: string[];               // Optional conversation tags
  userId?: number;               // Optional user ID for multi-user systems
  imageContextUrl?: string | null;
  providerServiceId?: number; // Add this line
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
  role: 'user' | 'admin'| 'team_admin'; // User's system role
  credits: number; // User's credit balance
  // AI models assigned to this user
  assigned_models: AiModel[];

  // --- NEW: Add fields from our team implementation ---
  parent_id?: number;
  credit_limit?: number | null; // Can be a number or null for unlimited
  is_active: boolean; 
  tts_voice?: string | null;

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
      type: 'error' | 'task_failed'; // Combined for simplicity
      message_id: string | number;
      error: string;
      message: string;
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


/**
 * Defines a specific service offered by a provider (e.g., Chat, Image Gen).
 */
export interface AiService {
  providerServiceId?: number; // --- MODIFIED: This is the unique numeric ID from the database ---
  id: string; // e.g., 'chat', 'image-generation'
  name: string; // User-friendly name like "Chat" or "Image Generation"
  modelId: string; // The specific API model ID for this service (e.g., 'gpt-4o')
  description: string; // A short description shown in the UI
  Icon: LucideIcon; // The icon component to display for this service

    // --- START: ADD THIS NEW PROPERTY ---
  capabilities?: {
    input_types?: string[];
    aspect_ratios?: string[];
    max_duration_seconds?: number;
    [key: string]: any; // Allows for other future capabilities
  };
  // --- END: ADD THIS NEW PROPERTY ---
}

/**
 * Defines the AI Provider (e.g., OpenAI, Google).
 */
export interface AiProvider {
  id: string; // e.g., 'openai'
  name: string; // e.g., "OpenAI"
  icon?: React.ElementType; 
  services: AiService[]; // A list of services this provider offers
}

/**
 * AI Agent Definition
 *
 * Represents a specialized, pre-configured AI agent for a specific task.
 */
export interface Agent {
  id: number;
  name: string;
  description: string;
  system_prompt: string;
  icon_name: string | null;
  provider_service_id: number;
}