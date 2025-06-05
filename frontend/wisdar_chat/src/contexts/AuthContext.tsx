// frontend/wisdar_chat/src/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

type UserRole = 'user' | 'admin';

interface User {
  username: string;
  role: UserRole;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (usernameInput: string, passwordInput: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check for persisted user session (mock)
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (usernameInput: string, passwordInput: string): Promise<boolean> => {
    // Mock authentication logic
    if (usernameInput === 'admin' && passwordInput === 'adminpass') {
      const adminUser: User = { username: 'admin', role: 'admin' };
      setUser(adminUser);
      localStorage.setItem('currentUser', JSON.stringify(adminUser));
      return true;
    }
    if (usernameInput === 'user' && passwordInput === 'userpass') {
      const regularUser: User = { username: 'user', role: 'user' };
      setUser(regularUser);
      localStorage.setItem('currentUser', JSON.stringify(regularUser));
      return true;
    }
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return false; // Login failed
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout }}>
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