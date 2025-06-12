import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { AiModel } from '../types'; // Import the shared AiModel type

type UserRole = 'user' | 'admin';

// MODIFIED: User interface now expects an array of assigned models from the backend
export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  assigned_models: AiModel[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (emailInput: string, passwordInput: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullNameInput: string, emailInput: string, passwordInput: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Get the API URL from the environment variable we just set
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // This effect runs on initial load to check for a persisted session
    const token = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');

    if (token && storedUser) {
      // In a real app, you might re-validate the token with the backend here.
      // For now, we'll trust the stored user data if a token exists.
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (emailInput: string, passwordInput: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Make a real API call to the backend /login endpoint
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailInput, password: passwordInput }),
      });

      const data = await response.json();
     // --- ADD THIS DEBUGGING LINE ---
      console.log("LOGIN RESPONSE - User data from backend:", data.user);
      // -----------------------------
      if (!response.ok) {
        // If response is not 2xx, use the error message from the backend
        return { success: false, error: data.message || 'Login failed' };
      }

      // On successful login, backend returns an access_token and user object
      if (data.access_token && data.user) {
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: 'Invalid response from server.' };
      }

    } catch (error) {
      console.error("Login API call failed:", error);
      return { success: false, error: "Cannot connect to the server." };
    }
  };

  const register = async (fullNameInput: string, emailInput: string, passwordInput: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Make a real API call to the backend /register endpoint
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullNameInput,
          email: emailInput,
          password: passwordInput
        })
      });
      
      const data = await response.json();

      if (!response.ok) { // Check if response status is not 2xx
        // Use the error message from the backend (e.g., "Email already exists")
        return { success: false, error: data.message || "Registration failed" };
      }
      
      // Registration was successful
      return { success: true };

    } catch (error) {
      console.error("Registration API call failed:", error);
      return { success: false, error: "Cannot connect to the server." };
    }
  };

  const logout = () => {
    setUser(null);
    // Clear both the user data and the authentication token from storage
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};