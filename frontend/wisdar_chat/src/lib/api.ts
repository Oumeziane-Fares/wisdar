// This function will be our new, smarter fetch function for authenticated requests.
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