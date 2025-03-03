#!/bin/bash

# Configuration
SERVER="root@music-aipi.com"
DEPLOY_DIR="/opt/music-aipi"
DOCKER_COMPOSE_FILE="docker-compose.yml"
DOCKERFILE="Dockerfile"
ENV_FILE=".env.production"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Deploying to $SERVER...${NC}"

# 1. Build web client locally
echo "Building web client..."
cd web-client && npm install && npm run build && cd ..

# 2. Create deployment directory on server
echo "Creating deployment directory..."
ssh $SERVER "mkdir -p $DEPLOY_DIR"

# 3. Create exclude list for rsync
cat > .deploy-exclude << EOL
.git
.gitignore
.env
.env.*
node_modules
web-client/node_modules
logs
*.log
coverage
.vscode
.idea
*.test.js
__tests__
__mocks__
EOL

# 4. Stop existing containers
echo "Stopping existing containers..."
ssh $SERVER "cd $DEPLOY_DIR && docker compose down --remove-orphans"

# 5. Clean old dist
echo "Cleaning old dist..."
ssh $SERVER "cd $DEPLOY_DIR && rm -rf web-client/dist"

# 6. Copy necessary files using rsync
echo "Copying files to server..."
rsync -azP --delete --exclude-from=.deploy-exclude \
    ./ $SERVER:$DEPLOY_DIR/

# 7. Copy environment file
echo "Copying environment file..."
scp $ENV_FILE $SERVER:$DEPLOY_DIR/$ENV_FILE

# 8. Build and start new containers
echo "Starting deployment on server..."
ssh $SERVER "cd $DEPLOY_DIR && \
    docker compose pull && \
    docker compose up --build -d && \
    docker image prune -f"

# 9. Clean up local exclude file
rm .deploy-exclude

# 10. Check deployment status
echo "Checking deployment status..."
ssh $SERVER "cd $DEPLOY_DIR && docker compose ps"

echo -e "${GREEN}Deploy finished successfully${NC}"