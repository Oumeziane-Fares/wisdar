// frontend/wisdar_chat/src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import your translation files
import translationEN from './locales/en/translation.json';
import translationAR from './locales/ar/translation.json';

const resources = {
  en: {
    translation: translationEN,
  },
  ar: {
    translation: translationAR,
  },
};

// Function to set document attributes based on language
const setDocumentAttributes = (lng: string) => {
  document.documentElement.lang = lng;
  if (lng === 'ar') {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
};

i18n
  .use(LanguageDetector) // Detect user language
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources,
    fallbackLng: 'en', // Default language if detection fails
    debug: process.env.NODE_ENV === 'development', // Enable debug mode in development
    interpolation: {
      escapeValue: false, // React already protects from XSS
    },
    detection: {
      // Order and from where user language should be detected
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage'], // Where to cache the detected language
    },
  }, (err, t) => {
    // Callback after init for older i18next versions,
    // or can be placed directly after .init if using i18next >= 21.x.x
    if (err) return console.error('Error initializing i18next:', err);
    
    // Set initial document attributes after i18next has initialized
    // and determined the language
    setDocumentAttributes(i18n.language);
  });

// Listener for language change to update document direction
i18n.on('languageChanged', (lng) => {
  setDocumentAttributes(lng);
});

export default i18n;