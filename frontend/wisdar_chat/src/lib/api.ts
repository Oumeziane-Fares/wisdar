import { Conversation, Message, AiModel, SseEvent, User } from '@/types';

// The base URL for all API requests. This is proxied by Vite during development.
const API_BASE_URL = '/api';

/**
 * A wrapper for the native `fetch` function that automatically includes
 * authentication credentials (cookies) and handles common error scenarios,
 * like redirecting to login on a 401 Unauthorized response.
 *
 * @param url The API endpoint to call (e.g., '/auth/me').
 * @param options The standard `RequestInit` options for the fetch call.
 * @returns A promise that resolves to the `Response` object.
 */
export const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    // Default options for every authenticated request
    const defaultOptions: RequestInit = {
        ...options,
        // This is crucial: it tells the browser to send cookies with the request
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
    };

    const response = await fetch(`${API_BASE_URL}${url}`, defaultOptions);

    // If the server returns 401, it means the session is invalid. Redirect to login.
    if (response.status === 401) {
        // Prevent infinite loops if the login page itself causes a 401
        if (!window.location.pathname.startsWith('/login')) {
            console.error('Unauthorized access. Redirecting to login.');
            window.location.href = '/login';
        }
        // Throw an error to stop further execution in the calling function
        throw new Error('Unauthorized');
    }

    return response;
};

/**
 * Uploads an audio blob to the backend for transcription.
 *
 * @param audioBlob The audio data to upload.
 * @returns A promise that resolves to an object containing the transcription text.
 */
export const fetchAudioBlob = async (audioBlob: Blob): Promise<{ transcription: string }> => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm'); // filename is arbitrary but good practice

    // We don't use `authFetch` here because sending multipart/form-data
    // requires the browser to set the Content-Type header with the boundary.
    const response = await fetch(`${API_BASE_URL}/chat/transcribe`, { // Assuming this is the correct backend endpoint
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
    const response = await authFetch('/chat/conversations');
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
    const url = new URL(`${window.location.origin}${API_BASE_URL}/chat/stream`);
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
