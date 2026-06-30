# Deploy Manufacturing CRM to Your Own Domain

This guide will help you deploy your Manufacturing CRM application to your own domain using Docker and a VPS/cloud server.

## Prerequisites

- A VPS or cloud server (Ubuntu 20.04+ recommended)
- Docker and Docker Compose installed
- A domain name pointing to your server
- SSL certificate (Let's Encrypt recommended)

## Step 1: Server Setup

```bash
# Update your server
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y

# Install certbot for SSL
sudo apt install certbot -y
```

## Step 2: Domain Configuration

1. Point your domain's A record to your server's IP address
2. Set up subdomains if needed:
   - `api.your-domain.com` for backend API
   - `app.your-domain.com` for frontend (optional)

## Step 3: SSL Certificate

```bash
# Generate SSL certificate with Let's Encrypt
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Create SSL directory
mkdir -p ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
sudo chown -R $USER:$USER ssl/
```

## Step 4: Environment Configuration

1. Copy the project files to your server
2. Edit `.env.production`:

```bash
# Update these values
VITE_PROD_API_BASE_URL=https://api.your-domain.com
POSTGRES_PASSWORD=your-super-secure-password
JWT_SECRET=your-jwt-secret-key-256-bits
SESSION_SECRET=your-session-secret-key
```

3. Edit `nginx.conf`:
   - Replace `your-domain.com` with your actual domain
   - Update SSL certificate paths if needed

4. Edit `docker-compose.yml`:
   - Update environment variables as needed
   - Configure port mappings for your setup

## Step 5: Build and Deploy

```bash
# Build the application
./deploy.sh prod https://api.your-domain.com

# Start the services
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Step 6: Database Setup

```bash
# Run database migrations (if you have them)
docker-compose exec app npm run db:push

# Or manually connect to PostgreSQL
docker-compose exec postgres psql -U admin -d manufacturing_crm
```

## Step 7: Verify Deployment

1. Check if services are running:
```bash
docker-compose ps
```

2. Test your application:
   - Frontend: `https://your-domain.com`
   - API health: `https://api.your-domain.com/health`

3. Check logs for any issues:
```bash
docker-compose logs app
docker-compose logs nginx
docker-compose logs postgres
```

## Environment-Specific Deployments

### Development Environment
```bash
# Set development API URL
export VITE_DEV_API_BASE_URL=https://dev-api.your-domain.com

# Build for development
./deploy.sh dev https://dev-api.your-domain.com

# Use development compose file
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### Production Environment
```bash
# Set production API URL
export VITE_PROD_API_BASE_URL=https://api.your-domain.com

# Build for production
./deploy.sh prod https://api.your-domain.com

# Deploy to production
docker-compose up -d
```

## Monitoring and Maintenance

### SSL Certificate Renewal
```bash
# Add to crontab for automatic renewal
sudo crontab -e
# Add this line:
0 3 * * * certbot renew --quiet && docker-compose restart nginx
```

### Backup Database
```bash
# Create backup
docker-compose exec postgres pg_dump -U admin manufacturing_crm > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T postgres psql -U admin manufacturing_crm < backup_20250112.sql
```

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and redeploy
./deploy.sh prod https://api.your-domain.com
docker-compose down
docker-compose up -d --build
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 80, 443, and 5432 are available
2. **SSL issues**: Verify domain DNS and certificate paths
3. **Database connection**: Check PostgreSQL credentials and network
4. **API errors**: Verify backend URL configuration and CORS settings

### Useful Commands

```bash
# View all logs
docker-compose logs

# Restart specific service
docker-compose restart app

# Update a single service
docker-compose up -d --no-deps app

# Access application shell
docker-compose exec app sh

# Monitor resources
docker stats

# Clean up unused containers/images
docker system prune
```

## Security Recommendations

1. **Firewall**: Only allow ports 22 (SSH), 80 (HTTP), and 443 (HTTPS)
2. **SSH**: Use key-based authentication, disable password login
3. **Database**: Never expose PostgreSQL port to the internet
4. **Secrets**: Use environment variables, never commit secrets to git
5. **Updates**: Keep Docker images and system packages updated
6. **Backups**: Set up automated database and file backups

## Support

If you encounter issues:
1. Check application logs: `docker-compose logs app`
2. Verify network connectivity: `docker-compose exec app ping api.your-domain.com`
3. Test database connection: `docker-compose exec app node -e "console.log('DB test')"`
4. Review nginx configuration: `docker-compose exec nginx nginx -t`