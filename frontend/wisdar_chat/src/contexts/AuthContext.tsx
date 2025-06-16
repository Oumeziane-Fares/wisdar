import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { authFetch } from '@/lib/api'; // Corrected import path

// Define the shape of the User object
interface User {
  id: string;
  full_name: string;
  email: string;
}

// Define the shape of the context value
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  // This effect runs on initial app load to check if a user session exists
  useEffect(() => {
    const checkUserStatus = async () => {
      try {
        // We make a request to a protected endpoint.
        // If the cookie is valid, this will succeed and return user data.
        const response = await authFetch('/auth/me'); // Using the new /me route
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // This case handles when the cookie is invalid or expired
          setUser(null);
        }
      } catch (error) {
        console.log('No active session found or server is down.');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkUserStatus();
  }, []);

  const login = async (email: string, password: string) => {
    // Note: The /api prefix is handled by the Vite proxy
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      // The auth cookie is set by the server automatically.
      // The response now contains the user object.
      setUser(data.user);
    } else {
      throw new Error(data.message || 'Login failed');
    }
  };
  
  const register = async (fullName: string, email: string, password: string) => {
    const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
    }
    // After registration, you can prompt the user to log in.
  };

  const logout = async () => {
    try {
      // Call the backend logout endpoint to clear the http-only cookie
      await authFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error("Logout request failed, clearing client-side state anyway.", error);
    } finally {
      // Clear user state on the client
      setUser(null);
      // Redirect to login page
      window.location.href = '/login';
    }
  };

  const contextValue = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    register,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {!loading && children}
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
