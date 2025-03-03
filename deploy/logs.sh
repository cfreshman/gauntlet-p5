#!/bin/bash

SERVER="root@music-aipi.com"
DEPLOY_DIR="/opt/music-aipi"

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Connecting to logs...${NC}"
ssh $SERVER "cd $DEPLOY_DIR && docker compose logs -f" 