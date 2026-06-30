# Replit Deployment Guide for Karma Group

## 🚀 Two-Environment Replit Deployment Setup

You can deploy your Manufacturing CRM to two separate Replit deployments with different environment variables.

### 📋 Deployment Configurations

#### Development Deployment
- **Environment**: Development
- **API Backend**: `https://api-dev.karma-grp.com`
- **Config File**: `.replit.dev`

#### Production Deployment  
- **Environment**: Production
- **API Backend**: `https://api-prod.karma-grp.com`
- **Config File**: `.replit.prod`

## 🔧 Setup Instructions

### Step 1: Create Two Deployments

1. **Development Deployment**:
   - Copy `.replit.dev` content to `.replit`
   - Deploy using Replit Deploy button
   - Name it "Manufacturing CRM - Dev"

2. **Production Deployment**:
   - Copy `.replit.prod` content to `.replit` 
   - Deploy using Replit Deploy button
   - Name it "Manufacturing CRM - Prod"

### Step 2: Environment Variables per Deployment

In each Replit deployment, set these secrets:

#### Development Deployment Secrets
```
NODE_ENV=development
VITE_DEV_API_BASE_URL=https://api-dev.karma-grp.com
```

#### Production Deployment Secrets
```
NODE_ENV=production
VITE_PROD_API_BASE_URL=https://api-prod.karma-grp.com
```

### Step 3: Deploy Commands

For each deployment, you can use:

```bash
# Development
npm run build:dev
npm start

# Production  
npm run build:prod
npm start
```

## 📱 Alternative: Branch-Based Deployment

You can also create separate branches for each environment:

### Development Branch
```bash
git checkout -b development
cp .replit.dev .replit
git add .replit
git commit -m "Configure for development deployment"
```

### Production Branch
```bash
git checkout -b production  
cp .replit.prod .replit
git add .replit
git commit -m "Configure for production deployment"
```

Then deploy each branch separately in Replit.

## 🌐 Final Deployment URLs

After deploying both environments, you'll have:

- **Development**: `https://your-dev-deployment.replit.app`
- **Production**: `https://your-prod-deployment.replit.app`

Both will connect to their respective Karma Group backend APIs automatically based on the environment configuration.

## 🔄 Managing Updates

To update both deployments:

1. Make changes to your main branch
2. Merge to development branch → auto-deploy dev
3. Merge to production branch → auto-deploy prod

Or manually redeploy each environment through the Replit interface.

Your Manufacturing CRM will now run on two separate Replit deployments with proper environment-specific backend connectivity!