// src/lib/service-icons.tsx

import { LucideIcon, Bot, Search, Image as ImageIcon, Video, Mic, Voicemail } from 'lucide-react';

// This map links a service ID from the backend to a specific Lucide icon component.
export const serviceIconMap: { [key: string]: LucideIcon } = {
  'chat': Bot,
  'chat-search': Search, // In case you add web search later
  'image': ImageIcon,
  'video': Video,
  'tts': Voicemail,
  'transcription': Mic,
};

// A fallback icon for any service that doesn't have a specific icon defined.
export const DefaultServiceIcon = Bot;