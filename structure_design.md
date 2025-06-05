# Structure et conception du projet de chat Wisdar

## Architecture globale

L'architecture du projet sera basée sur une application full-stack avec:
- **Frontend**: Application React pour l'interface utilisateur
- **Backend**: API Flask pour la logique métier et l'intégration avec les modèles IA
- **Base de données**: Pour stocker les utilisateurs, conversations et paramètres

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  Interface      │◄────►│  API            │◄────►│  Base de        │
│  React          │      │  Flask          │      │  données        │
│                 │      │                 │      │                 │
└─────────────────┘      └────────┬────────┘      └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │                 │
                         │  API IA         │
                         │  (OpenAI/autre) │
                         │                 │
                         └─────────────────┘
```

## Structure des dossiers

```
wisdar_chat_project/
├── frontend/                  # Application React
│   ├── public/                # Fichiers statiques
│   └── src/
│       ├── assets/            # Images, icônes, etc.
│       ├── components/        # Composants réutilisables
│       │   ├── chat/          # Composants liés au chat
│       │   ├── settings/      # Composants liés aux paramètres
│       │   ├── admin/         # Composants liés à l'administration
│       │   └── common/        # Composants communs (boutons, inputs, etc.)
│       ├── contexts/          # Contextes React (auth, theme, etc.)
│       ├── hooks/             # Hooks personnalisés
│       ├── pages/             # Pages principales
│       ├── services/          # Services API
│       ├── styles/            # Styles globaux
│       └── utils/             # Fonctions utilitaires
├── backend/                   # API Flask
│   ├── src/
│   │   ├── models/            # Modèles de données
│   │   ├── routes/            # Routes API
│   │   │   ├── auth.py        # Routes d'authentification
│   │   │   ├── chat.py        # Routes de chat
│   │   │   ├── admin.py       # Routes d'administration
│   │   │   └── user.py        # Routes utilisateur
│   │   ├── services/          # Services métier
│   │   ├── utils/             # Utilitaires
│   │   └── main.py            # Point d'entrée
│   ├── venv/                  # Environnement virtuel Python
│   └── requirements.txt       # Dépendances Python
└── docs/                      # Documentation
```

## Conception des interfaces

### 1. Interface Utilisateur (Chat)

#### Disposition générale
```
┌────────────────────────────────────────────────────────────────┐
│ [Logo Wisdar]            Titre de la conversation     [Profil] │
├────────────┬───────────────────────────────────────────────────┤
│            │                                                   │
│  Liste des │                                                   │
│            │                                                   │
│  conver-   │         Zone d'affichage des messages             │
│            │                                                   │
│  sations   │                                                   │
│            │                                                   │
│            │                                                   │
│            │                                                   │
│            │                                                   │
├────────────┴───────────────────────────────────────────────────┤
│  [Nouvelle conversation]    [Zone de saisie]    [Envoyer]      │
└────────────────────────────────────────────────────────────────┘
```

#### Fonctionnalités clés
- Barre latérale rétractable pour la liste des conversations
- Affichage des messages avec distinction visuelle entre utilisateur et IA
- Support pour le streaming en temps réel des réponses
- Bouton pour créer une nouvelle conversation
- Fonctionnalité de recherche dans les conversations
- Options pour renommer/supprimer les conversations
- Indicateur de chargement pendant la génération de réponses

### 2. Interface Paramètres Utilisateur

#### Disposition générale
```
┌────────────────────────────────────────────────────────────────┐
│ [Logo Wisdar]            Paramètres utilisateur      [Retour]  │
├────────────┬───────────────────────────────────────────────────┤
│            │                                                   │
│  Navigation│  ┌─────────────────────────────────────────────┐  │
│            │  │                                             │  │
│  - Profil  │  │                                             │  │
│            │  │                                             │  │
│  - Interface│ │         Zone de configuration               │  │
│            │  │                                             │  │
│  - Confiden-│ │                                             │  │
│    tialité │  │                                             │  │
│            │  └─────────────────────────────────────────────┘  │
│  - Notif.  │                                                   │
│            │  [Annuler]                          [Enregistrer] │
└────────────┴───────────────────────────────────────────────────┘
```

#### Fonctionnalités clés
- Navigation par onglets pour différentes catégories de paramètres
- Formulaires pour modifier les informations de profil
- Options de thème (clair/sombre) et personnalisation de l'interface
- Paramètres de confidentialité et de notifications
- Boutons pour enregistrer ou annuler les modifications

### 3. Interface d'Administration

#### Disposition générale
```
┌────────────────────────────────────────────────────────────────┐
│ [Logo Wisdar]      Administration Wisdar Chat        [Profil]  │
├────────────┬───────────────────────────────────────────────────┤
│            │                                                   │
│  Dashboard │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│            │  │ Utilisateurs│ │Conversations│ │ Utilisation │  │
│  Utilisat. │  │    1,234    │ │   5,678     │ │    89%      │  │
│            │  └─────────────┘ └─────────────┘ └─────────────┘  │
│  Conversat.│                                                   │
│            │  ┌─────────────────────────────────────────────┐  │
│  Utilisation│ │                                             │  │
│            │  │         Graphiques et statistiques          │  │
│  Paramètres│  │                                             │  │
│            │  └─────────────────────────────────────────────┘  │
│            │                                                   │
└────────────┴───────────────────────────────────────────────────┘
```

#### Fonctionnalités clés
- Tableau de bord avec statistiques et graphiques
- Gestion des utilisateurs (création, modification, suppression)
- Surveillance de la consommation des ressources
- Configuration système et paramètres globaux
- Exportation de rapports et données

## Flux utilisateur

### Flux de conversation
1. L'utilisateur se connecte à l'application
2. Il voit la liste de ses conversations précédentes
3. Il peut sélectionner une conversation existante ou en créer une nouvelle
4. Il saisit un message et l'envoie
5. Le système affiche une indication de chargement
6. La réponse de l'IA s'affiche progressivement (streaming)
7. L'utilisateur peut continuer la conversation ou effectuer d'autres actions

### Flux d'administration
1. L'administrateur se connecte avec ses identifiants
2. Il accède au tableau de bord d'administration
3. Il peut consulter les statistiques globales
4. Il peut gérer les utilisateurs (ajouter, modifier, supprimer)
5. Il peut surveiller la consommation des ressources
6. Il peut configurer les paramètres système

## Base de données

### Schéma simplifié
```
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│    Users      │       │ Conversations │       │   Messages    │
├───────────────┤       ├───────────────┤       ├───────────────┤
│ id            │       │ id            │       │ id            │
│ username      │       │ title         │◄──────┤ conversation_id│
│ email         │◄──────┤ user_id       │       │ role          │
│ password_hash │       │ created_at    │       │ content       │
│ role          │       │ updated_at    │       │ created_at    │
│ settings      │       └───────────────┘       └───────────────┘
└───────────────┘
```

## API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion utilisateur
- `POST /api/auth/register` - Inscription (admin uniquement)
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/me` - Informations utilisateur courant

### Chat
- `GET /api/conversations` - Liste des conversations
- `POST /api/conversations` - Créer une nouvelle conversation
- `GET /api/conversations/{id}` - Détails d'une conversation
- `PUT /api/conversations/{id}` - Modifier une conversation
- `DELETE /api/conversations/{id}` - Supprimer une conversation
- `POST /api/conversations/{id}/messages` - Envoyer un message
- `GET /api/conversations/{id}/messages` - Historique des messages

### Administration
- `GET /api/admin/users` - Liste des utilisateurs
- `POST /api/admin/users` - Créer un utilisateur
- `GET /api/admin/users/{id}` - Détails d'un utilisateur
- `PUT /api/admin/users/{id}` - Modifier un utilisateur
- `DELETE /api/admin/users/{id}` - Supprimer un utilisateur
- `GET /api/admin/stats` - Statistiques globales
- `GET /api/admin/usage` - Données d'utilisation

## Prochaines étapes

1. Rechercher l'identité visuelle de Wisdar
2. Créer un guide de style basé sur cette identité
3. Configurer l'environnement de développement
4. Commencer le développement du frontend et du backend
5. Intégrer les fonctionnalités de chat avec streaming
6. Développer les interfaces d'administration
