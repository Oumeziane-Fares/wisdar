import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// --- NEW ---
// SVG component for the Google logo
const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    fill="currentColor"
  >
    <path
      fill="#4285F4"
      d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.82l-7.11-5.52c-2.17 1.46-4.94 2.32-8.78 2.32-6.76 0-12.47-4.55-14.51-10.61H2.27v5.7C6.24 42.66 14.55 48 24 48z"
    />
    <path
      fill="#FBBC05"
      d="M9.49 28.19c-.45-1.32-.7-2.73-.7-4.19s.25-2.87.7-4.19v-5.7H2.27C.86 17.05 0 20.42 0 24c0 3.58.86 6.95 2.27 9.89l7.22-5.7z"
    />
    <path
      fill="#EA4335"
      d="M24 9.42c3.52 0 6.62 1.21 9.1 3.63l6.3-6.3C35.91 2.25 30.47 0 24 0 14.55 0 6.24 5.34 2.27 12.41l7.22 5.7c2.04-6.06 7.75-10.61 14.51-10.61z"
    />
    <path fill="none" d="M0 0h48v48H0z" />
  </svg>
);

// SVG component for the X logo
const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    fill="currentColor"
  >
    <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z" />
  </svg>
);

const AuthPage: React.FC = () => {
  const { login, register } = useAuth();
  const { t } = useTranslation();

  const [isLoginView, setIsLoginView] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (isLoginView) {
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || t('loginErrorInvalidCredentials', 'Invalid credentials.'));
      }
    } else {
      const result = await register(fullName, email, password);
      if (result.success) {
        setSuccess(t('registrationSuccess', 'Registration successful! Please log in.'));
        setIsLoginView(true);
      } else {
        setError(result.error || t('registrationError', 'Registration failed.'));
      }
    }
    setIsLoading(false);
  };

  const handleSocialLogin = (provider: 'google' | 'twitter') => {
    console.log(`Redirecting to ${provider} for authentication...`);
    window.location.href = `http://localhost:5000/api/auth/${provider}`;
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
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
            <Button type="submit" className="w-full bg-[#6B5CA5] hover:bg-[#5d4f91]" disabled={isLoading}>
              {isLoading ? t('loading', 'Loading...') : (isLoginView ? t('loginButton') : t('registerButton', 'Register'))}
            </Button>
          </form>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {t('or_continue_with', 'Or continue with')}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {/* --- UPDATED --- */}
              <Button variant="outline" onClick={() => handleSocialLogin('google')}>
                <GoogleIcon className="mr-2 h-4 w-4" />
                Google
              </Button>
              <Button variant="outline" onClick={() => handleSocialLogin('twitter')}>
                <XIcon className="mr-2 h-4 w-4" />
                X
              </Button>
            </div>
          </div>

        </CardContent>
        <CardFooter className="flex flex-col gap-2 text-center text-sm">
          <Button variant="link" className="p-0 h-auto" onClick={() => { setIsLoginView(!isLoginView); setError(''); setSuccess(''); }}>
            {isLoginView ? t('switchToRegister', "Don't have an account? Register") : t('switchToLogin', "Already have an account? Login")}
          </Button>
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