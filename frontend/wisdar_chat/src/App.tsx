// frontend/wisdar_chat/src/App.tsx
// This is the version you provided in your last message (contentFetchId: uploaded:oumeziane-fares/wisdar-ai/Oumeziane-Fares-wisdar-ai-3315a5d78fff1102a36e684d2c8ddb125d5927aa/frontend/wisdar_chat/src/App.tsx)
// It already contains the correct logic for Message/Attachment interfaces and handleSendMessage
// for creating fileURL for audio attachments.
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/ui/ThemeProvider';
import ChatSidebar from './components/chat/ChatSidebar';
import ChatArea, { AiModel } from './components/chat/ChatArea';
import SettingsPanel from './components/settings/SettingsPanel';
import AdminDashboard from './components/admin/AdminDashboard';
import AuthPage from './pages/AuthPage'; 
import { useAuth } from './contexts/AuthContext'; 
import './App.css';

type MessageRole = 'user' | 'assistant';
type View = 'chat' | 'settings' | 'admin';

interface Attachment {
  fileName: string;
  fileType: string; 
  fileURL: string;
}

interface Message {
  id: string;
  content: string; 
  role: MessageRole;
  timestamp: string;
  attachment?: Attachment;
}

interface Conversation {
  id: string;
  title: string;
  date: string;
  messages: Message[]; 
  active?: boolean;
  aiModelId: string; 
}

function App() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user } = useAuth(); 

  const defaultModelId = 'gemini-2.5-pro'; 

  const staticModelsConfig: Omit<AiModel, 'name'>[] = [
    { id: 'gemini-2.5-pro' }, 
    { id: 'claude-3-opus' },   
    { id: 'gpt-4-turbo' },   
  ];

  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [globalSelectedAiModel, setGlobalSelectedAiModel] = useState<string>(defaultModelId);

  const getTranslatedModels = (): AiModel[] => {
    return staticModelsConfig.map(model => ({
      ...model,
      name: t(`model.${model.id.replace(/-/g, '')}`, model.id) 
    }));
  };
  
  const getInitialConversations = (currentAvailModels: AiModel[]): Conversation[] => [
    {
      id: '1',
      title: t('firstConversationTitle'),
      date: '04/06/2025', 
      active: true,
      messages: [
        { id: '1', content: t('initialAssistantMessage'), role: 'assistant', timestamp: '10:00' },
        { id: '2', content: t('initialUserMessage'), role: 'user', timestamp: '10:01' },
        { 
          id: '3', 
          content: t('assistantServiceDescription', { 
            modelName: currentAvailModels.find(m=>m.id === defaultModelId)?.name || defaultModelId 
          }), 
          role: 'assistant', 
          timestamp: '10:02' 
        }
      ],
      aiModelId: defaultModelId 
    },
    { id: '2', title: t('technicalSupportTitle'), date: '03/06/2025', messages: [], aiModelId: defaultModelId },
    { id: '3', title: t('projectIdeasTitle'), date: '02/06/2025', messages: [], aiModelId: defaultModelId }
  ];

  const [currentView, setCurrentView] = useState<View>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    document.title = t('appTitle');
    const translatedModels = getTranslatedModels();
    setAvailableModels(translatedModels);

    if (isAuthenticated) {
      if (conversations.length === 0) { 
        const initialConvos = getInitialConversations(translatedModels); 
        if (initialConvos.length > 0) {
          const ensureActiveAndModel = initialConvos.map((convo, index) => ({
            ...convo,
            active: index === 0, 
            aiModelId: convo.aiModelId || globalSelectedAiModel 
          }));
          setConversations(ensureActiveAndModel);
          if (ensureActiveAndModel[0]?.aiModelId) {
            setGlobalSelectedAiModel(ensureActiveAndModel[0].aiModelId);
          }
        }
      } else {
        setConversations(prevConvos => prevConvos.map(conv => ({
          ...conv,
          title: t( (conv.id === '1' ? 'firstConversationTitle' : conv.id === '2' ? 'technicalSupportTitle' : conv.id === '3' ? 'projectIdeasTitle' : 'conversationTitleFallback'), conv.title) 
        })));
      }
    } else {
      setConversations([]); 
    }
  }, [t, i18n.language, isAuthenticated]); 

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentView('chat'); 
    }
  }, [isAuthenticated]);

  const activeConversation = conversations.find(conv => conv.active) || (conversations.length > 0 ? conversations[0] : null);
  
  const handleSelectConversation = (id: string) => {
    const selectedConv = conversations.find(conv => conv.id === id);
    if (selectedConv) {
      setGlobalSelectedAiModel(selectedConv.aiModelId); 
      setConversations(conversations.map(conv => ({
        ...conv,
        active: conv.id === id
      })));
    }
  };
  
  const handleNewConversation = () => {
    const currentActive = conversations.find(conv => conv.active);
    if (currentActive && currentActive.messages.length === 0) {
      if(currentActive.aiModelId !== globalSelectedAiModel) {
        setConversations(prev => prev.map(c => c.id === currentActive.id ? {...c, aiModelId: globalSelectedAiModel} : c));
      }
      if (!currentActive.active) { // This case should ideally not happen if logic is correct
          handleSelectConversation(currentActive.id);
      }
      return; 
    }

    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: t('conversationTitleFallback'),
      date: new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : 'en-US'),
      active: true,
      messages: [],
      aiModelId: globalSelectedAiModel 
    };
    setConversations(prevConversations => [
      newConversation,
      ...prevConversations.map(conv => ({ ...conv, active: false }))
    ]);
  };
  
  const handleSendMessage = (content: string, attachments?: File[]) => {
    if (!activeConversation) return;

    const modelForThisMessage = activeConversation.aiModelId;
    const modelDetails = availableModels.find(m => m.id === modelForThisMessage);
    
    let messageAttachment: Attachment | undefined = undefined;
    let messageContent = content;

    if (attachments && attachments.length > 0) {
      const file = attachments[0]; 
      
      if (file.type.startsWith('audio/')) {
        const fileURL = URL.createObjectURL(file); 
        messageAttachment = {
          fileName: file.name,
          fileType: file.type,
          fileURL: fileURL, 
        };
        messageContent = content.trim() ? content : t('voiceNoteSent', 'Voice Note'); 
      } else {
        messageContent = `${content} (${t('fileAttachedMessageShort', { count: attachments.length })}: ${attachments.map(f=>f.name).join(', ')})`;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      role: 'user',
      timestamp: new Date().toLocaleTimeString(i18n.language === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' }),
      attachment: messageAttachment, 
    };
    
    setConversations(prev => prev.map(conv => 
      conv.id === activeConversation.id ? { ...conv, messages: [...conv.messages, userMessage] } : conv
    ));
    
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: t('simulatedAssistantResponseWithModel', { modelName: modelDetails?.name || modelForThisMessage }),
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString(i18n.language === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setConversations(prevConversations => 
        prevConversations.map(conv => {
          const currentActiveConv = prevConversations.find(c => c.active);
          if (currentActiveConv && conv.id === currentActiveConv.id) {
            return { ...conv, messages: [...conv.messages, assistantMessage] };
          }
          return conv;
        })
      );
    }, 1000);
  };

  const handleAiModelChange = (newModelId: string) => {
    setGlobalSelectedAiModel(newModelId); 
    if (activeConversation && activeConversation.messages.length === 0) {
      setConversations(prevConvos => 
        prevConvos.map(c => 
          c.id === activeConversation.id ? { ...c, aiModelId: newModelId } : c
        )
      );
    }
  };

  if (!isAuthenticated) {
    return ( <ThemeProvider> <AuthPage /> </ThemeProvider> );
  }
  
  return ( 
    <ThemeProvider>
      <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {currentView === 'chat' && activeConversation && (
          <div className="h-full flex">
            <ChatSidebar 
              conversations={conversations}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onOpenSettings={() => setCurrentView('settings')}
            />
            <div className="flex-1">
              <ChatArea 
                conversationTitle={activeConversation.title || t('conversationTitleFallback')}
                messages={activeConversation.messages || []}
                onSendMessage={handleSendMessage}
                availableModels={availableModels}
                selectedModel={activeConversation.aiModelId}
                onSelectModel={handleAiModelChange}
              />
            </div>
          </div>
        )}
        {currentView === 'chat' && !activeConversation && isAuthenticated && (
             <div className="h-full flex items-center justify-center">
                <p>{t('noActiveConversation', 'Select a conversation or start a new one.')}</p>
            </div>
        )}
        
        {currentView === 'settings' && ( <SettingsPanel onBack={() => setCurrentView('chat')} /> )}
        {currentView === 'admin' && user?.role === 'admin' && ( <AdminDashboard /> )}
        
        {user?.role === 'admin' && currentView !== 'admin' && (
          <button 
            onClick={() => setCurrentView('admin')}
            className="fixed bottom-4 right-4 rtl:left-4 rtl:right-auto p-2 bg-[#6B5CA5] text-white rounded-md"
          >
            {t('adminPanelAccessButton')}
          </button>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;