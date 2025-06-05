import React, { useState } from 'react';
import { ThemeProvider } from './components/ui/ThemeProvider';
import ChatSidebar from './components/chat/ChatSidebar';
import ChatArea from './components/chat/ChatArea';
import SettingsPanel from './components/settings/SettingsPanel';
import AdminDashboard from './components/admin/AdminDashboard';
import './App.css';

// Types
type MessageRole = 'user' | 'assistant';
type View = 'chat' | 'settings' | 'admin';

interface Message {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  date: string;
  messages: Message[];
  active?: boolean;
}

function App() {
  // État pour la vue actuelle
  const [currentView, setCurrentView] = useState<View>('chat');
  
  // État pour les conversations
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: '1',
      title: 'Première conversation',
      date: '04/06/2025',
      active: true,
      messages: [
        {
          id: '1',
          content: 'Bonjour, comment puis-je vous aider aujourd\'hui?',
          role: 'assistant',
          timestamp: '10:00'
        },
        {
          id: '2',
          content: 'Je voudrais des informations sur votre service.',
          role: 'user',
          timestamp: '10:01'
        },
        {
          id: '3',
          content: 'Bien sûr! Notre service de chat intelligent vous permet de communiquer facilement avec une IA avancée. Vous pouvez poser des questions, demander de l'aide ou simplement discuter. Que souhaitez-vous savoir spécifiquement?',
          role: 'assistant',
          timestamp: '10:02'
        }
      ]
    },
    {
      id: '2',
      title: 'Aide technique',
      date: '03/06/2025',
      messages: []
    },
    {
      id: '3',
      title: 'Idées de projet',
      date: '02/06/2025',
      messages: []
    }
  ]);
  
  // Trouver la conversation active
  const activeConversation = conversations.find(conv => conv.active) || conversations[0];
  
  // Gérer la sélection d'une conversation
  const handleSelectConversation = (id: string) => {
    setConversations(conversations.map(conv => ({
      ...conv,
      active: conv.id === id
    })));
  };
  
  // Créer une nouvelle conversation
  const handleNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'Nouvelle conversation',
      date: new Date().toLocaleDateString('fr-FR'),
      active: true,
      messages: []
    };
    
    setConversations([
      newConversation,
      ...conversations.map(conv => ({
        ...conv,
        active: false
      }))
    ]);
  };
  
  // Envoyer un message
  const handleSendMessage = (content: string) => {
    if (!activeConversation) return;
    
    // Message de l'utilisateur
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };
    
    // Mise à jour de la conversation active avec le message de l'utilisateur
    const updatedConversations = conversations.map(conv => {
      if (conv.id === activeConversation.id) {
        return {
          ...conv,
          messages: [...conv.messages, userMessage]
        };
      }
      return conv;
    });
    
    setConversations(updatedConversations);
    
    // Simuler une réponse de l'assistant après un court délai
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Voici une réponse simulée de l'assistant. Dans une version réelle, cette réponse viendrait de l'API backend.",
        role: 'assistant',
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      };
      
      setConversations(prevConversations => 
        prevConversations.map(conv => {
          if (conv.id === activeConversation.id) {
            return {
              ...conv,
              messages: [...conv.messages, assistantMessage]
            };
          }
          return conv;
        })
      );
    }, 1000);
  };
  
  return (
    <ThemeProvider>
      <div className="h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {currentView === 'chat' && (
          <div className="h-full flex">
            <ChatSidebar 
              conversations={conversations}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onOpenSettings={() => setCurrentView('settings')}
            />
            <div className="flex-1">
              <ChatArea 
                conversationTitle={activeConversation?.title || 'Nouvelle conversation'}
                messages={activeConversation?.messages || []}
                onSendMessage={handleSendMessage}
              />
            </div>
          </div>
        )}
        
        {currentView === 'settings' && (
          <SettingsPanel onBack={() => setCurrentView('chat')} />
        )}
        
        {currentView === 'admin' && (
          <AdminDashboard />
        )}
        
        {/* Bouton temporaire pour accéder à l'interface admin (à remplacer par un système d'authentification) */}
        {currentView !== 'admin' && (
          <button 
            onClick={() => setCurrentView(currentView === 'admin' ? 'chat' : 'admin')}
            className="fixed bottom-4 right-4 p-2 bg-[#6B5CA5] text-white rounded-md"
          >
            {currentView === 'admin' ? 'Retour au chat' : 'Interface Admin'}
          </button>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
