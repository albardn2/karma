#!/bin/bash

# Manufacturing CRM Deployment Script
# This script ensures proper production deployment with all required environment variables

echo "🚀 Starting Manufacturing CRM Deployment..."

# Set production environment
export NODE_ENV=production

# Validate required environment variables
if [ -z "$SESSION_SECRET" ]; then
    echo "⚠️  WARNING: SESSION_SECRET not set. Using default value."
    export SESSION_SECRET="default-production-secret-$(date +%s)"
fi

if [ -z "$PORT" ]; then
    echo "📝 Setting default PORT to 5000"
    export PORT=5000
fi

echo "🔧 Environment Configuration:"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: $PORT"
echo "  SESSION_SECRET: ${SESSION_SECRET:0:10}..."

# Build the application
echo "🏗️  Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Exiting..."
    exit 1
fi

echo "✅ Build completed successfully"

# Verify build artifacts exist
if [ ! -d "dist" ]; then
    echo "❌ Build directory 'dist' not found!"
    exit 1
fi

if [ ! -f "dist/index.js" ]; then
    echo "❌ Server bundle 'dist/index.js' not found!"
    exit 1
fi

if [ ! -d "dist/public" ]; then
    echo "❌ Static files directory 'dist/public' not found!"
    exit 1
fi

if [ ! -f "dist/public/index.html" ]; then
    echo "❌ Frontend 'dist/public/index.html' not found!"
    exit 1
fi

echo "✅ All build artifacts verified"

# Start the production server
echo "🚀 Starting production server..."
exec npm start