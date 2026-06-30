# Deployment Configuration Guide

## Environment Setup

This application supports multiple deployment environments (dev/prod) with different backend API URLs.

### Environment Variables

Create environment files for each deployment:

#### Development Deployment (.env.development)
```bash
# Development environment
NODE_ENV=development
VITE_DEV_API_BASE_URL=https://your-dev-backend.ngrok-free.app
```

#### Production Deployment (.env.production)
```bash
# Production environment  
NODE_ENV=production
VITE_PROD_API_BASE_URL=https://api.your-production-domain.com
```

#### Override for Specific Deployments (.env.local)
```bash
# Override for specific deployment (optional - takes priority)
VITE_API_BASE_URL=https://custom-api-url.com
```

### Build Commands

```bash
# Development build
NODE_ENV=development npm run build

# Production build  
NODE_ENV=production npm run build
```

### Replit Deployment

For Replit deployments, set environment variables in your Repl:

1. Go to Tools → Secrets
2. Add your environment variables:
   - `VITE_DEV_API_BASE_URL` for development
   - `VITE_PROD_API_BASE_URL` for production
   - `VITE_API_BASE_URL` for specific override

### Domain Configuration

Replace the placeholder URLs in your environment variables:

- **Development**: `https://your-dev-backend.ngrok-free.app` 
- **Production**: `https://api.your-production-domain.com`

### How It Works

The app automatically selects the correct API URL based on:

1. **Priority 1**: `VITE_API_BASE_URL` (override for specific deployments)
2. **Priority 2**: Environment-specific URLs (`VITE_DEV_API_BASE_URL` or `VITE_PROD_API_BASE_URL`)
3. **Priority 3**: Default fallback URLs

### Testing Configuration

Check the browser console for logs showing:
- Current environment (development/production)
- Selected API Base URL

This helps verify the correct backend is being used.