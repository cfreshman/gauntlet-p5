#!/bin/bash

# Configuration
SERVER="root@music-aipi.com"
DOMAIN="music-aipi.com"
EMAIL="cyrus@freshman.dev"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Setting up SSL for $DOMAIN...${NC}"

# Check DNS propagation
echo "Checking DNS propagation..."
IP=$(dig +short $DOMAIN)
if [ -z "$IP" ]; then
    echo -e "${RED}Error: Domain $DOMAIN is not pointing to any IP address.${NC}"
    echo "Please set up your DNS records first and wait for propagation."
    exit 1
fi

# Get SSL certificate
echo "Getting SSL certificate..."
ssh $SERVER "certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email $EMAIL"

# Configure Nginx with SSL
echo "Configuring Nginx with SSL..."
cat > nginx.conf << 'EOL'
server {
    listen 80;
    listen [::]:80;
    server_name music-aipi.com www.music-aipi.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name music-aipi.com www.music-aipi.com;

    ssl_certificate /etc/letsencrypt/live/music-aipi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music-aipi.com/privkey.pem;

    # WebSocket support
    location /chat {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /thinking {
        proxy_pass http://localhost:3014;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Copy and enable Nginx config
echo "Updating Nginx configuration..."
scp nginx.conf $SERVER:/etc/nginx/sites-available/music-aipi
ssh $SERVER "nginx -t && systemctl restart nginx"

# Clean up
rm nginx.conf

echo -e "${GREEN}SSL setup complete!${NC}"
echo -e "\nYour site should now be accessible at:"
echo -e "https://$DOMAIN"
echo -e "https://www.$DOMAIN" 