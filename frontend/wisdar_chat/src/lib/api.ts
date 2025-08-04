// src/lib/api.ts

import { Conversation, User } from '@/types';

const API_BASE_URL = '/api';

/**
 * Attempts to refresh the access token.
 */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return refreshResponse.ok;
  } catch (error) {
    console.error("An error occurred during token refresh:", error);
    return false;
  }
}

/**
 * A wrapper for fetch that handles auth, content types, and token refreshing.
 */
export async function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin).toString();

  // --- [MODIFIED] This block is now fully type-safe ---
  // 1. Initialize a new Headers object from the provided options.
  //    This safely handles all possible formats of the headers.
  const headers = new Headers(options.headers);

  // 2. Conditionally set the Content-Type header if the body is not FormData.
  //    Using .set() is the correct, type-safe way to modify headers.
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
  }
  // --- END OF MODIFICATION ---

  const config: RequestInit = {
    ...options,
    headers: headers, // Pass the properly constructed Headers object
    credentials: 'include',
  };

  let response = await fetch(url, config);

  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      console.log("Retrying the original request with the new token...");
      response = await fetch(url, config);
    } else {
      console.error("Refresh failed. Redirecting to login.");
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized: Session expired.');
    }
  }
  return response;
}


// --- API Functions currently in use by the application ---

/**
 * Fetches all conversations for the current user.
 */
export const getConversations = async (): Promise<Conversation[]> => {
    const response = await authFetch('/chat/conversations');
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return response.json();
};

/**
 * Fetches a list of all users (for admin panels).
 */
export const getAllUsers = async (): Promise<User[]> => {
    const response = await authFetch('/auth/users');
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
};

/**
 * Marks a conversation as deleted.
 */
export const deleteConversation = async (conversationId: string | number): Promise<Response> => {
    return await authFetch(`/chat/conversations/${conversationId}`, {
        method: 'DELETE',
    });
};

/**
 * Renames a conversation on the backend.
 */
export const renameConversation = async (
  conversationId: string | number,
  newTitle: string
): Promise<Conversation> => {
  const response = await authFetch(`/chat/conversations/${conversationId}/rename`, {
    method: 'PUT',
    body: JSON.stringify({ new_title: newTitle }),
  });
  if (!response.ok) {
    throw new Error('Failed to rename conversation');
  }
  return response.json();
};

/**
 * Toggles the pinned status of a conversation on the backend.
 */
export const togglePinConversation = async (conversationId: string | number): Promise<Conversation> => {
  const response = await authFetch(`/chat/conversations/${conversationId}/pin`, {
    method: 'PUT',
  });
  if (!response.ok) {
    throw new Error('Failed to pin conversation');
  }
  return response.json();
};

/**
 * --- THIS IS THE NEW FUNCTION ---
 * An XMLHttpRequest wrapper to handle file uploads with progress reporting.
 */
export const authUpload = (
  endpoint: string,
  formData: FormData,
  onUploadProgress: (progress: number) => void
): Promise<Response> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin).toString();
    
    xhr.open('POST', url, true);
    // This is crucial for sending authentication cookies with the request
    xhr.withCredentials = true;

    // This event listener tracks the upload progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded * 100) / event.total);
        onUploadProgress(percentage);
      }
    };

    // Handle successful completion of the request
    xhr.onload = () => {
      const response = new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: { 'Content-Type': 'application/json' }, // Assuming server responds with JSON
      });
      resolve(response);
    };

    // Handle network errors
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Network request timed out'));

    xhr.send(formData);
  });
};