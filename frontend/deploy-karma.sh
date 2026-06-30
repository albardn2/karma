#!/bin/bash

# Karma Group Deployment Script
# Usage: ./deploy-karma.sh [dev|prod]

set -e

ENVIRONMENT=${1:-prod}

echo "🚀 Deploying Manufacturing CRM for Karma Group - $ENVIRONMENT environment"

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Invalid environment. Use 'dev' or 'prod'"
    exit 1
fi

# Set configuration based on environment
if [[ "$ENVIRONMENT" == "dev" ]]; then
    export NODE_ENV=development
    export VITE_DEV_API_BASE_URL="https://api-dev.karma-grp.com"
    DOMAIN="dev.karma-grp.com"
    COMPOSE_FILE="docker-compose.yml -f docker-compose.dev.yml"
    echo "📡 Development deployment for dev.karma-grp.com"
    echo "🔗 Backend API: https://api-dev.karma-grp.com"
elif [[ "$ENVIRONMENT" == "prod" ]]; then
    export NODE_ENV=production
    export VITE_PROD_API_BASE_URL="https://api-prod.karma-grp.com"
    DOMAIN="karma-grp.com"
    COMPOSE_FILE="docker-compose.yml"
    echo "📡 Production deployment for karma-grp.com"
    echo "🔗 Backend API: https://api-prod.karma-grp.com"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Type check
echo "🔍 Running type checks..."
npm run check

# Build application
echo "🔨 Building application for $ENVIRONMENT..."
npm run build

# Deploy with Docker
echo "🐳 Deploying with Docker..."
docker-compose -f $COMPOSE_FILE down 2>/dev/null || true
docker-compose -f $COMPOSE_FILE up -d --build

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "   Environment: $ENVIRONMENT"
echo "   Domain: $DOMAIN"
echo "   Backend API: https://api-$ENVIRONMENT.karma-grp.com"
echo ""
echo "🌐 Application URLs:"
echo "   Frontend: https://$DOMAIN"
echo "   Backend API: https://api-$ENVIRONMENT.karma-grp.com"
echo ""
echo "💡 Monitor deployment:"
echo "   docker-compose logs -f"
echo "   docker-compose ps"