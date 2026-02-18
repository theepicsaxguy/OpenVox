#!/bin/bash
set -e

# Ensure data and cache directories exist
mkdir -p /app/data/sources /app/data/audio /home/pockettts/.cache/huggingface

# Handle user/group for both Docker and Kubernetes scenarios
# In Docker: pockettts user exists from build time
# In Kubernetes: may run with arbitrary UID, user may not exist in /etc/passwd

if id pockettts &>/dev/null; then
    # pockettts user exists - use it
    TARGET_USER="pockettts"
    TARGET_GROUP="pockettts"
else
    # Kubernetes with dynamic UID - create user dynamically or use current
    CURRENT_UID=$(id -u)
    CURRENT_GID=$(id -g)
    
    # Check if current user is already non-root and has a valid login
    if [ "$CURRENT_UID" != "0" ]; then
        # Use current user (Kubernetes style - run as whatever UID is specified)
        TARGET_USER=$(whoami 2>/dev/null || echo "root")
        TARGET_GROUP=$(id -gn 2>/dev/null || echo "root")
    else
        # Running as root - create pockettts user if it doesn't exist
        useradd --create-home --shell /bin/bash pockettts || true
        TARGET_USER="pockettts"
        TARGET_GROUP="pockettts"
    fi
fi

# Fix ownership of mounted volumes (directories created by volume mount are owned by root)
chown -R "${TARGET_USER}:${TARGET_GROUP}" /app/data /home/pockettts/.cache 2>/dev/null || true

# If running as root, drop privileges; otherwise run as current user
if [ "$(id -u)" = "0" ]; then
    exec gosu "${TARGET_USER}" "$@"
else
    # Already running as non-root (e.g., Kubernetes with arbitrary UID)
    exec "$@"
fi
