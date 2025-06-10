/**
 * This is your existing, robust fetch function. It handles adding the
 * JWT token to requests and automatically logs the user out on a 401 error.
 * @param url The full URL to fetch from.
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

    // Perform the fetch call with the updated options
    const response = await fetch(url, {
        ...options,
        headers,
    });

    // This is the crucial part: check for 401 Unauthorized status
    if (response.status === 401) {
        // Clear user data and token from storage
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        
        // Force a page reload to redirect to the AuthPage.
        // The AuthContext will see that there's no user and show the login form.
        window.location.reload();

        // Throw an error to stop further processing in the original function call
        throw new Error("User is not authenticated.");
    }

    return response;
}


// --- NEW FUNCTION ---
/**
 * Fetches a protected audio file using your existing authFetch and returns it as a Blob.
 * A Blob is a representation of raw file data.
 * @param fileUrl The full URL of the audio file to fetch.
 * @returns A Promise that resolves to a Blob object.
 */
export const fetchAudioBlob = async (fileUrl: string): Promise<Blob> => {
    // We reuse your existing authFetch function to automatically handle authentication.
    const response = await authFetch(fileUrl); // This performs a simple GET request.

    if (!response.ok) {
        // Your authFetch handles 401 errors. This will catch other errors like 404 (Not Found).
        throw new Error(`Failed to fetch audio file: ${response.statusText}`);
    }

    // The response body is the raw audio data, which we return as a Blob.
    return response.blob();
};
