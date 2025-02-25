#!/bin/bash

# run-no-warnings.sh
# this script runs the system with NODE_OPTIONS set to disable deprecation warnings

# set NODE_OPTIONS to disable deprecation warnings
export NODE_OPTIONS="--no-deprecation"

# run the system
npm run mcp:all

# reset NODE_OPTIONS
unset NODE_OPTIONS 