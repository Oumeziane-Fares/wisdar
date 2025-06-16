Of course. Here is a complete, consolidated deployment guide that incorporates the production-ready recommendations we discussed.

This single document contains the full, recommended configuration for deploying your application with a focus on security, performance, and robustness.

---

# **Recommended Production Deployment Guide: Wisdar AI Chat Application (HTTPS)**

**Version 3.0 (Recommended)**

## **Introduction**

This document provides a comprehensive, step-by-step guide for deploying the Wisdar AI chat application on a production server with a secure **HTTPS** connection. The application stack consists of:

* **Backend:** Python/Flask application served by **Gunicorn**.
* **Frontend:** A React (Vite) single-page application.
* **Task Queue & Pub/Sub:** Celery and Redis.
* **Web Server:** Nginx as a reverse proxy with an SSL certificate from Let's Encrypt.

This guide assumes the target server is running **Ubuntu 24.04 LTS** and that you have a **domain name** (e.g., `chat.wisdar.net`) pointing to your server's public IP address.

---

## **Step 1: Install Server Prerequisites & Create User**

Connect to your server via SSH. Run the following commands to install software and create a dedicated application user for better security.

```bash
# 1. Refresh package lists and install any pending updates
sudo apt update && sudo apt upgrade -y

# 2. Install Python, Pip, Venv, Git, Nginx, and Redis
sudo apt install -y python3-pip python3.12-venv git nginx redis-server

# 3. Install Node Version Manager (NVM)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 4. Reload shell configuration to use NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 5. Install and use Node.js version 20
nvm install 20

# 6. Create a dedicated system user to run the application securely
sudo adduser --system --group wisdar
```

---

## **Step 2: Deploy and Secure Application Code**

Clone your application's source code and set the correct ownership.

```bash
# Navigate to your user's home directory (e.g., /home/root01)
cd ~

# Clone your project
git clone git@github.com:Oumeziane-Fares/wisdar-ai.git

# Set ownership of the code to the dedicated 'wisdar' user
sudo chown -R wisdar:wisdar wisdar-ai/

# Navigate into the project's root directory
cd wisdar-ai/
```

---

## **Step 3: Configure the Backend**

Set up the Python backend, its dependencies (including Gunicorn), and its environment variables.

1.  **Navigate to the backend directory:**
    `cd backend/wisdar_backend/`

2.  **Create and activate a Python Virtual Environment:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install Python Dependencies:**
    *Ensure `gunicorn` is listed in your `requirements.txt` file.*
    `pip install -r requirements.txt`

4.  **Create the Environment File (`.env`):**
    `nano .env`

    Copy the template below, updating the values for your setup. **Crucially, update `PUBLIC_SERVER_URL` to use `https://`**.

    ```env
    # --- Database Configuration (MySQL) ---
    DB_HOST=your_database_host
    DB_PORT=3306
    DB_USERNAME=your_database_username
    DB_PASSWORD=your_database_password
    DB_NAME=your_database_name

    # --- Security & Encryption Keys ---
    JWT_SECRET_KEY='a_very_strong_and_long_random_secret_key_for_jwt'
    RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIC...your_key_content_here...\n-----END PRIVATE KEY-----"
    MODEL_ENCRYPTION_KEY='your_random_model_encryption_key'
    
    # --- Service & API Configuration ---
    # !! IMPORTANT: Update this to use https and your domain name !!
    PUBLIC_SERVER_URL="https://chat.wisdar.net"
    REDIS_URL="redis://localhost:6379/0"
    SPEECHMATICS_API_KEY="your_speechmatics_api_key_here"
    ```
    Save and exit (`Ctrl+X`, `Y`, `Enter`).

---

## **Step 4: Build the Frontend for Production**

Build the React frontend into optimized, static files. Nginx will serve these files directly for maximum performance.

1.  **Navigate to the frontend directory:**
    `cd ../../frontend/wisdar_chat/`

2.  **Install Node.js Dependencies:**
    `npm install`

3.  **Build the Production Application:**
    `npm run build`

---

## **Step 5: Configure Persistent Services (systemd)**

Create `systemd` services to run your Gunicorn application and Celery worker continuously using the secure `wisdar` user.

1.  **Navigate back to the project root's backend directory:**
    `cd ../../backend/wisdar_backend/`

2.  **Create the Gunicorn Application Service File:**
    `sudo nano /etc/systemd/system/wisdar-app.service`
    ```ini
    [Unit]
    Description=Gunicorn instance to serve the Wisdar AI Chat App
    After=network.target

    [Service]
    User=wisdar
    Group=wisdar
    WorkingDirectory=/home/root01/wisdar-ai/backend/wisdar_backend
    ExecStart=/home/root01/wisdar-ai/backend/wisdar_backend/venv/bin/gunicorn --workers 4 --worker-class gevent --bind 0.0.0.0:5000 "src.main:app"
    Restart=always

    [Install]
    WantedBy=multi-user.target
    ```

3.  **Create the Celery Worker Service File:**
    `sudo nano /etc/systemd/system/wisdar-celery.service`
    ```ini
    [Unit]
    Description=Celery Worker for Wisdar AI Chat App
    After=network.target wisdar-app.service redis-server.service

    [Service]
    User=wisdar
    Group=wisdar
    WorkingDirectory=/home/root01/wisdar-ai/backend/wisdar_backend
    ExecStart=/home/root01/wisdar-ai/backend/wisdar_backend/venv/bin/celery -A src.celery_app.celery_app worker -l info -P gevent
    Restart=always

    [Install]
    WantedBy=multi-user.target
    ```

4.  **Enable and Start the Services:**
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl start wisdar-app
    sudo systemctl enable wisdar-app
    sudo systemctl start wisdar-celery
    sudo systemctl enable wisdar-celery
    ```

---

## **Step 6: Configure Nginx for High Performance**

Configure Nginx to serve static files directly and proxy API requests to your Gunicorn application.

1.  **Create an Nginx Configuration File:**
    `sudo nano /etc/nginx/sites-available/wisdar`

2.  **Paste this high-performance configuration.**
    ```nginx
    server {
        listen 80;
        server_name chat.wisdar.net; # Replace with your domain

        # Path for the built React application
        root /home/root01/wisdar-ai/frontend/wisdar_chat/dist;
        index index.html;

        # Proxy API calls to the Flask/Gunicorn backend
        location /api {
            proxy_pass http://127.0.0.1:5000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Special location for the SSE streaming endpoint
        location /api/stream/events {
            proxy_pass http://127.0.0.1:5000/api/stream/events;
            proxy_set_header Connection '';
            proxy_set_header X-Accel-Buffering no;
            chunked_transfer_encoding off;
        }

        # Fallback for React Router (handles page reloads on different routes)
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
    ```

3.  **Enable the Site and Test Nginx:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/wisdar /etc/nginx/sites-enabled/
    sudo nginx -t
    ```
    If the test is successful, proceed to the next step.

---

## **Step 7: Enabling HTTPS with Let's Encrypt**

Install a free SSL certificate from Let's Encrypt to secure your site.

1.  **Install Certbot:**
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```

2.  **Obtain the SSL Certificate:** Run Certbot. It will automatically detect your domain from the Nginx file, obtain a certificate, and update your Nginx configuration.
    ```bash
    # Use your actual domain name here
    sudo certbot --nginx -d chat.wisdar.net
    ```
    When prompted, choose the option to **redirect** HTTP traffic to HTTPS for the best security.

3.  **Restart Nginx to Apply All Changes:**
    ```bash
    sudo systemctl restart nginx
    ```

## **Deployment Complete**

Your application is now fully deployed and securely accessible at `https://your_domain_name`. It is running with a robust, high-performance configuration.