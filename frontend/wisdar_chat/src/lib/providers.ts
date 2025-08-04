import { AiProvider } from '@/types';
import { Bot, Search, Image as ImageIcon, Video, Mic, Voicemail } from 'lucide-react';

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    services: [
      { id: 'chat', name: 'Chat', modelId: 'gpt-4o', description: 'Flagship model for general conversation.', Icon: Bot },
      { id: 'chat-search', name: 'Web Chat', modelId: 'gpt-4o', description: 'Chat with real-time web results.', Icon: Search },
      { id: 'image', name: 'Image Generation', modelId: 'dall-e-3', description: 'Create high-quality images from text.', Icon: ImageIcon },
      { id: 'tts', name: 'Text-to-Speech', modelId: 'tts-1-hd', description: 'Convert text into spoken audio.', Icon: Voicemail },
      { id: 'transcription', name: 'Audio Transcription', modelId: 'whisper-1', description: 'Convert speech into text.', Icon: Mic },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    services: [
      { id: 'chat', name: 'Chat', modelId: 'gemini-1.5-pro-latest', description: 'Massive context window for complex reasoning.', Icon: Bot },
      { id: 'chat-search', name: 'Web Chat', modelId: 'gemini-1.5-pro-latest', description: 'Ground responses with Google Search.', Icon: Search },
      { id: 'image', name: 'Image Generation', modelId: 'imagegeneration@006', description: 'Generate photorealistic images.', Icon: ImageIcon },
      { id: 'video', name: 'Video Generation', modelId: 'veo-2', description: 'Create HD video clips.', Icon: Video },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    services: [
      { id: 'chat', name: 'Chat', modelId: 'claude-3-5-sonnet-20240620', description: 'Top-tier intelligence with a focus on safety.', Icon: Bot },
      { id: 'chat-search', name: 'Web Chat', modelId: 'claude-3-5-sonnet-20240620', description: 'Enable web search for factual answers.', Icon: Search },
    ],
  },
];