// Environment-based API configuration
const getApiBaseUrl = () => {
  // Check for environment-specific variable first
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Fallback based on environment
  const environment = import.meta.env.MODE || 'development';
  
  switch (environment) {
    case 'production':
      return import.meta.env.VITE_PROD_API_BASE_URL || 'https://api-prod.karma-grp.com';
    case 'development':
    default:
      return import.meta.env.VITE_DEV_API_BASE_URL || 'https://api-dev.karma-grp.com';
  }
};

export const API_BASE_URL = getApiBaseUrl();

// Log current configuration for debugging
console.log(`Environment: ${import.meta.env.MODE}`);
console.log(`API Base URL: ${API_BASE_URL}`);