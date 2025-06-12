/**
 * This is your existing, robust fetch function. It handles adding the
 * JWT token to requests and automatically logs the user out on a 401 error.
 * It now also intelligently handles both relative API paths and full URLs.
 * @param url The relative path (e.g., '/api/login') or full URL to fetch from.
 * @param options The standard fetch options (method, body, etc.).
 * @returns A Promise that resolves to the raw Response object.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('authToken');

    // Prepare the headers
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    // If we are sending FormData, we should NOT set the Content-Type header.
    // The browser will set it automatically with the correct boundary.
    if (!(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    // --- THIS IS THE INTEGRATED FIX ---
    // Create a variable for the final, complete URL.
    let finalUrl: string;

    // Check if the provided URL is already a full, absolute URL.
    if (url.startsWith('http://') || url.startsWith('https://')) {
        // If it is, use it directly. This is for fetching audio files.
        finalUrl = url;
    } else {
        // If it's a relative path (like '/api/login'), then prepend the base API URL.
        const baseUrl = import.meta.env.VITE_API_URL || '';
        finalUrl = `${baseUrl}${url}`;
    }
    // ------------------------------------

    // Perform the fetch call with the constructed URL and updated options
    const response = await fetch(finalUrl, {
        ...options,
        headers,
    });

    // This is the crucial part: check for 401 Unauthorized status
    if (response.status === 401) {
        // Clear user data and token from storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        // Force a page reload to redirect to the AuthPage.
        window.location.reload();

        // Throw an error to stop further processing
        throw new Error("User is not authenticated.");
    }

    return response;
}


// --- THIS FUNCTION NOW WORKS CORRECTLY ---
/**
 * Fetches a protected audio file using your existing authFetch and returns it as a Blob.
 * A Blob is a representation of raw file data.
 * @param fileUrl The full URL of the audio file to fetch.
 * @returns A Promise that resolves to a Blob object.
 */
export const fetchAudioBlob = async (fileUrl: string): Promise<Blob> => {
    // We reuse authFetch. Because fileUrl is a full URL, authFetch will use it directly.
    const response = await authFetch(fileUrl); // This performs a simple GET request.

    if (!response.ok) {
        // authFetch handles 401 errors. This will catch other errors like 404 (Not Found).
        throw new Error(`Failed to fetch audio file: ${response.statusText}`);
    }

    // The response body is the raw audio data, which we return as a Blob.
    return response.blob();
};
