#!/bin/bash

# Server Setup Script for Manufacturing CRM
# Run this on your Ubuntu server

set -e

DOMAIN=$1
EMAIL=$2

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "Usage: ./server-setup.sh your-domain.com your-email@example.com"
    exit 1
fi

echo "🚀 Setting up server for Manufacturing CRM"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# Install Docker Compose
echo "🔧 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo apt install docker-compose -y
fi

# Install Certbot
echo "🔐 Installing Certbot..."
sudo apt install certbot -y

# Install Git
echo "📋 Installing Git..."
sudo apt install git -y

# Create application directory
echo "📁 Creating application directory..."
mkdir -p ~/manufacturing-crm
cd ~/manufacturing-crm

# Generate SSL certificate
echo "🔐 Generating SSL certificate..."
if [[ "$DOMAIN" == "karma-grp.com" ]]; then
    sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --non-interactive
else
    sudo certbot certonly --standalone -d $DOMAIN --email $EMAIL --agree-tos --non-interactive
fi

# Copy SSL certificates
echo "📋 Copying SSL certificates..."
mkdir -p ssl
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ssl/
sudo chown -R $USER:$USER ssl/

# Setup automatic SSL renewal
echo "🔄 Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && cd ~/manufacturing-crm && docker-compose restart nginx") | crontab -

# Configure firewall
echo "🛡️ Configuring firewall..."
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw --force enable

# Create swap file if needed
if [[ $(free -m | awk '/^Swap:/ {print $2}') -eq 0 ]]; then
    echo "💾 Creating swap file..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "✅ Server setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Copy your application files to ~/manufacturing-crm/"
echo "2. Update the configuration files with your domain"
echo "3. Run: docker-compose up -d"
echo ""
echo "🌐 Your application will be available at:"
echo "   https://$DOMAIN"
echo ""
echo "📁 Application directory: ~/manufacturing-crm"
echo "🔐 SSL certificates: ~/manufacturing-crm/ssl/"