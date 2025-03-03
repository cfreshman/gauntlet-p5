#!/bin/bash

# Configuration
SERVER="root@music-aipi.com"
DOMAIN="music-aipi.com"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Setting up server at $SERVER...${NC}"

# Initial system setup
echo "Updating system and installing prerequisites..."
ssh $SERVER "apt update && apt upgrade -y && \
    apt install -y apt-transport-https ca-certificates curl software-properties-common nginx certbot python3-certbot-nginx"

# Install Docker
echo "Installing Docker..."
ssh $SERVER "\
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    # Add Docker repository
    echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable\" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    # Install Docker
    apt update && \
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin"

# Configure initial basic Nginx
echo "Configuring initial Nginx setup..."
cat > nginx.conf << 'EOL'
server {
    listen 80;
    listen [::]:80;
    server_name music-aipi.com www.music-aipi.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOL

# Copy and enable Nginx config
echo "Setting up Nginx configuration..."
scp nginx.conf $SERVER:/etc/nginx/sites-available/music-aipi
ssh $SERVER "\
    ln -sf /etc/nginx/sites-available/music-aipi /etc/nginx/sites-enabled/ && \
    rm -f /etc/nginx/sites-enabled/default && \
    nginx -t && \
    systemctl restart nginx"

# Set up firewall
echo "Configuring firewall..."
ssh $SERVER "\
    ufw allow ssh && \
    ufw allow http && \
    ufw allow https && \
    ufw --force enable"

# Create deployment directory
echo "Creating deployment directory..."
ssh $SERVER "mkdir -p /opt/music-aipi && chmod 755 /opt/music-aipi"

# Clean up local Nginx config file
rm nginx.conf

echo -e "${GREEN}Initial server setup complete!${NC}"
echo -e "\nNext steps:"
echo -e "1. Update your DNS settings to point music-aipi.com to your server IP"
echo -e "2. Wait for DNS propagation (check with: dig music-aipi.com)"
echo -e "3. Run ./setup-ssl.sh to configure SSL"
echo -e "4. Update .env.production with the correct domain"
echo -e "5. Run ./deploy.sh to deploy the application" 