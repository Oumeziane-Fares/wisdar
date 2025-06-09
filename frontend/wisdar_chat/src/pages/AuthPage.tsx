import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
// The `authFetch` import is not needed in this file because all API calls
// are handled by the `login` and `register` functions from the useAuth hook.
// import { authFetch } from '../lib/api'; 

const AuthPage: React.FC = () => {
  const { login, register } = useAuth();
  const { t } = useTranslation();

  // State to toggle between Login and Register views
  const [isLoginView, setIsLoginView] = useState(true);

  // State for form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // State for providing feedback to the user
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Reset feedback messages on each new submission
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (isLoginView) {
      // --- Handles Login ---
      // Calls the login function from AuthContext, which handles the API call
      const result = await login(email, password);
      if (!result.success) {
        // Displays an error message from the context/backend if login fails
        setError(result.error || t('loginErrorInvalidCredentials', 'Invalid credentials.'));
      }
      // On success, App.tsx will automatically re-render because `isAuthenticated` changes.
    } else {
      // --- Handles Registration ---
      // Calls the register function from AuthContext
      const result = await register(fullName, email, password);
      if (result.success) {
        setSuccess(t('registrationSuccess', 'Registration successful! Please log in.'));
        setIsLoginView(true); // Switch to login view for the user
      } else {
        // Displays an error from the context/backend if registration fails
        setError(result.error || t('registrationError', 'Registration failed.'));
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img src="/images/logo-wisdar.png" alt="Wisdar" className="w-24 mx-auto mb-4" />
          <CardTitle>{isLoginView ? t('loginPageTitle') : t('registerPageTitle', 'Create an Account')}</CardTitle>
          <CardDescription>{isLoginView ? t('loginPageDescription') : t('registerPageDescription', 'Fill in the details to join.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name field is correctly rendered only for the registration view */}
            {!isLoginView && (
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('fullNameLabel', 'Full Name')}</Label>
                <Input
                  id="fullName" type="text" value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('fullNamePlaceholder', 'Your full name')}
                  required
                  className="dark:bg-gray-800 dark:text-white"
                />
              </div>
            )}

            {/* Email and Password fields are correctly rendered for both views */}
            <div className="space-y-2">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
                className="dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                className="dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Displays success or error messages to the user */}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
            
            <Button type="submit" className="w-full bg-[#6B5CA5] hover:bg-[#5d4f91]" disabled={isLoading}>
              {isLoading ? t('loading', 'Loading...') : (isLoginView ? t('loginButton') : t('registerButton', 'Register'))}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 text-center text-sm">
            {/* The toggle button correctly switches between the two views */}
            <Button variant="link" className="p-0 h-auto" onClick={() => { setIsLoginView(!isLoginView); setError(''); setSuccess(''); }}>
                {isLoginView ? t('switchToRegister', "Don't have an account? Register") : t('switchToLogin', "Already have an account? Login")}
            </Button>
            {/* The mock credentials section can be removed once you are fully using the backend */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <p className="font-semibold">{t('mockCredentialsInfo')}</p>
                <p>User: user@example.com / userpass</p>
                <p>Admin: admin@example.com / adminpass</p>
            </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthPage;