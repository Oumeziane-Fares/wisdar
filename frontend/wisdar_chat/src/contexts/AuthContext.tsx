import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { authFetch } from '@/lib/api'; // We will use this for all auth requests

// Define the shape of the User object
interface User {
  id: string; // Changed to string to match JWT identity
  full_name: string;
  email: string;
}

// Define the shape of the context value
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        const response = await authFetch('/auth/me'); // Correctly uses authFetch
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.log('No active session found or server is down.');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkUserStatus();
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
