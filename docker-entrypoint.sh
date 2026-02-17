#!/bin/bash
set -e

# Ensure data and cache directories exist with correct permissions
# Volume mounts are created by Docker as root, so we fix this at startup
mkdir -p /app/data/sources /app/data/audio /home/pockettts/.cache/huggingface

# Fix ownership of mounted volumes
chown -R pockettts:pockettts /app/data /home/pockettts/.cache

# Drop privileges and run as pockettts user
exec gosu pockettts "$@"
