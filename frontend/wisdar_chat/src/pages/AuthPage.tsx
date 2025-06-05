// frontend/wisdar_chat/src/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button"; //
import { Input } from "@/components/ui/input";   //
import { Label } from "@/components/ui/label";   //
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"; //

const AuthPage: React.FC = () => {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const success = await login(username, password);
    if (!success) {
      setError(t('loginErrorInvalidCredentials'));
    }
    setIsLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img src="/images/logo-wisdar.png" alt="Wisdar" className="w-24 mx-auto mb-4" />
          <CardTitle>{t('loginPageTitle')}</CardTitle>
          <CardDescription>{t('loginPageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('usernameLabel')}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('usernamePlaceholder')}
                required
                className="dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                className="dark:bg-gray-800 dark:text-white"
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" className="w-full bg-[#6B5CA5] hover:bg-[#5d4f91]" disabled={isLoading}>
              {isLoading ? t('loggingInButton') : t('loginButton')}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-center text-xs text-gray-500 dark:text-gray-400">
          <p>{t('mockCredentialsInfo')}</p>
          <p>User: user/ userpass</p>
          <p>Admin: admin/ adminpass</p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthPage;