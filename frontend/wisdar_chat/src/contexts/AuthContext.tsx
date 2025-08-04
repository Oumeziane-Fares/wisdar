import { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { authFetch } from '@/lib/api'; // We will use this for all auth requests
import { User as UserType } from '@/types'; // Import the comprehensive UserType from types

// Define the shape of the User object, now using the imported UserType
// No need for 'interface User extends UserType {}' if we just use UserType directly
type User = UserType; // Use type alias for clarity if preferred, or directly use UserType

// Define the shape of the context value
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void; // <-- ADD THIS LINE
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the AuthProvider
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // This effect runs on initial app load to check if a user session exists
  // This effect runs on initial app load to check if a user session exists
  useEffect(() => {
    // --- MODIFIED: We will now check the URL before trying to authenticate ---

    // Define the paths that do not require an authentication check
    const publicPaths = ['/login', '/invitation'];
    
    // Check if the current browser path starts with one of our defined public paths
    const isPublicPath = publicPaths.some(path => window.location.pathname.startsWith(path));

    const checkUserStatus = async () => {
      try {
        const response = await authFetch('/auth/me');
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.log('No active session found.');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    // --- THE FIX ---
    // If the path is public, we don't need to check for a session.
    // We can assume the user is not logged in and stop the loading process.
    if (isPublicPath) {
      setIsLoading(false);
      setUser(null);
    } else {
      // Otherwise, proceed with the authentication check as normal.
      checkUserStatus();
    }
  }, []);
  const login = async (email: string, password: string) => {
    // CORRECTED: Use authFetch to ensure credentials are sent
    const response = await authFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      // The user object is nested in the response from your backend
      setUser(data.user);
    } else {
      throw new Error(data.message || 'Login failed');
    }
  };
  
  const register = async (fullName: string, email: string, password: string) => {
    // CORRECTED: Use authFetch for consistency
    const response = await authFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
    }
  };

  const logout = async () => {
    try {
      await authFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error("Logout request failed, clearing client-side state anyway.", error);
    } finally {
      setUser(null);
    }
  };

  const contextValue = {
    user,
    isAuthenticated: !!user,
    isLoading, // Changed from 'loading' to 'isLoading' to match previous version
    setUser,
    login,
    logout,
    register,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context easily
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};