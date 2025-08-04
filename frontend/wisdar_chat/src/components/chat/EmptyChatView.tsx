// src/components/chat/EmptyChatView.tsx

import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useConversationStore } from '@/store/conversationStore';
import { getGreeting } from '@/lib/greetings';
import { Button } from '@/components/ui/button';

// --- This section of example prompts is unchanged ---
const promptsByService: { [key: string]: { text: string, action?: string }[] } = {
  'chat': [
    { text: "Write a short, engaging story about a robot who discovers music." },
    { text: "Brainstorm 3 unique names for a new coffee shop." },
    { text: "Explain the concept of blockchain as if I were a 10-year-old." },
  ],
  'chat-search': [
    { text: "What are the latest trends in renewable energy for 2025?" },
    { text: "Compare the pros and cons of the Mediterranean diet vs. the Keto diet." },
    { text: "Summarize the most recent reviews for the movie 'Dune: Part Two'." },
  ],
  'image': [
    { text: "A photorealistic image of a majestic lion with a crown, on a throne." },
    { text: "An astronaut gracefully riding a horse on the moon's surface, digital art." },
    { text: "Logo for a tech company named 'Nexus', minimalist, blue and silver." },
  ],
  'video': [
    { text: "Cinematic drone shot flying over a lush mountain range at sunrise." },
    { text: "A 5-second animated clip of a small robot watering a single plant." },
    { text: "A time-lapse video of a bustling city street, from day to night." },
  ],
  'transcription': [
    { text: "Transcribe a meeting recording", action: "trigger_upload" },
    { text: "Get a text version of a lecture", action: "trigger_upload" },
    { text: "Convert a voice note to text", action: "trigger_upload" },
  ],
  'default': [
      { text: "How does the stock market work?" },
      { text: "Tell me a fun fact about the Roman Empire." },
  ]
};

interface EmptyChatViewProps {
  onPromptClick: (prompt: { text: string, action?: string }) => void;
}

const EmptyChatView: React.FC<EmptyChatViewProps> = ({ onPromptClick }) => {
  const { user } = useAuth();
  // --- FIX 1: Get the new state variable `activeProviderServiceId` and `providers` ---
  const { activeProviderServiceId, providers } = useConversationStore();

  const greeting = useMemo(() => {
    return user ? getGreeting(user.full_name) : "Welcome";
  }, [user]);

  const currentPrompts = useMemo(() => {
    // --- FIX 2: Find the full service object to get its type (e.g., 'chat', 'image') ---
    let activeServiceType: string | undefined;

    if (activeProviderServiceId && providers) {
        for (const provider of providers) {
            const service = provider.services.find(s => s.providerServiceId === activeProviderServiceId);
            if (service) {
                activeServiceType = service.id; // This gets the string like 'chat' or 'video'
                break;
            }
        }
    }

    // This logic now uses the correctly derived service type
    const serviceKey = activeServiceType?.includes('chat') ? 'chat' : activeServiceType;
    return promptsByService[serviceKey as string] || promptsByService['default'];
  }, [activeProviderServiceId, providers]); // Update the dependency array

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">
          {greeting}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          How can I help you today?
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-3">
          {currentPrompts.map((prompt, index) => (
            <Button
              key={index}
              variant="outline"
              onClick={() => onPromptClick(prompt)}
              className="h-auto w-full text-left justify-start p-4 whitespace-normal"
            >
              {prompt.text}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmptyChatView;