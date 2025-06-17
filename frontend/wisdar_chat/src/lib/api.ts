import { Conversation, Message, AiModel, SseEvent, User } from '@/types';

// The base URL for all API requests. This is proxied by Vite during development.
const API_BASE_URL = '/api';

/**
 * A wrapper for the native `fetch` function that automatically includes
 * authentication credentials (cookies) and handles common error scenarios,
 * like redirecting to login on a 401 Unauthorized response.
 *
 * @param endpoint The API endpoint to call (e.g., '/auth/me').
 * @param options The standard `RequestInit` options for the fetch call.
 * @returns A promise that resolves to the `Response` object.
 */
export async function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  // CORRECTED: Construct a full, absolute URL relative to the window's origin.
  // This ensures that the request is always correctly routed through Vite's proxy.
  const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin).toString();

  // Define default headers
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options.headers,
  };

  // Merge default options with any provided options
  const config: RequestInit = {
    ...options,
    headers: defaultHeaders,
    // This is the most critical part for cookie-based auth
    credentials: 'include',
  };

  const response = await fetch(url, config);

  // RE-ADDED: This is a critical piece of auth handling. If the server returns a 401,
  // it means the user's session has expired, and they should be sent to the login page.
  if (response.status === 401) {
    // Prevent infinite redirect loops if the login page itself is unauthorized
    if (!window.location.pathname.startsWith('/login')) {
      console.error('Unauthorized access. Redirecting to login.');
      window.location.href = '/login';
    }
    // Throw an error to stop further execution in the calling function
    throw new Error('Unauthorized');
  }

  return response;
}


/**
 * Uploads an audio blob to the backend for transcription.
 *
 * @param audioBlob The audio data to upload.
 * @returns A promise that resolves to an object containing the transcription text.
 */
export const fetchAudioBlob = async (audioBlob: Blob): Promise<{ transcription: string }> => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm'); // filename is arbitrary but good practice

    // CORRECTED: Use the same robust URL construction for consistency.
    const url = new URL(`${API_BASE_URL}/chat/transcribe`, window.location.origin).toString();

    // We don't use `authFetch` here because sending multipart/form-data
    // requires the browser to set the Content-Type header with the boundary.
    const response = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include', // Important for sending the auth cookie
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to upload audio' }));
        throw new Error(errorData.message || 'Audio upload failed');
    }

    return response.json();
};


// --- API Functions for Chat and Conversations ---

/**
 * Fetches all conversations for the current user.
 */
export const getConversations = async (): Promise<Conversation[]> => {
    const response = await authFetch('s/chat/conversation');
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return response.json();
};

/**
 * Sends a new message and initiates a Server-Sent Events (SSE) stream for the response.
 *
 * @param conversationId The ID of the conversation.
 * @param content The text content of the message.
 * @param modelId The ID of the AI model to use.
 * @param handlers Callbacks for handling different SSE events.
 * @returns The EventSource instance, allowing it to be closed manually.
 */
export const streamChatResponse = (
    conversationId: string | number,
    content: string,
    modelId: string,
    handlers: {
        onOpen?: () => void;
        onUpdate: (event: SseEvent) => void;
        onClose?: () => void;
        onError?: (error: Event) => void;
    }
): EventSource => {
    // This function was already using the correct URL construction. No changes needed.
    const url = new URL(`${API_BASE_URL}/chat/stream`, window.location.origin);
    url.searchParams.append('conversation_id', String(conversationId));
    url.searchParams.append('content', content);
    url.searchParams.append('model_id', modelId);

    // EventSource automatically includes credentials when `withCredentials` is true.
    const eventSource = new EventSource(url.toString(), { withCredentials: true });

    eventSource.onopen = () => {
        console.log('SSE connection established.');
        handlers.onOpen?.();
    };

    eventSource.onmessage = (event) => {
        try {
            const parsedData: SseEvent = JSON.parse(event.data);
            handlers.onUpdate(parsedData);
        } catch (error) {
            console.error('Failed to parse SSE event data:', event.data, error);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        handlers.onError?.(error);
        eventSource.close();
        handlers.onClose?.();
    };

    return eventSource;
};


// --- API Functions for AI Models ---

/**
 * Fetches the list of available AI models assigned to the user.
 */
export const getModels = async (): Promise<AiModel[]> => {
    const response = await authFetch('/models');
    if (!response.ok) throw new Error('Failed to fetch AI models');
    return response.json();
};

// --- API Functions for User Management (Admin) ---

/**
 * Fetches a list of all users (for admin panels).
 */
export const getAllUsers = async (): Promise<User[]> => {
    const response = await authFetch('/auth/users');
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
};