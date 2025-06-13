import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const API_BASE_URL = 'https://fe37-2605-cb80-1009-1-e061-7d0-e89f-a457.ngrok-free.app';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (emailOrRfid: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
  user: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Periodic token validation - check every 5 minutes when authenticated
  useEffect(() => {
    let tokenValidationInterval: NodeJS.Timeout;

    if (isAuthenticated) {
      tokenValidationInterval = setInterval(async () => {
        console.log('Performing periodic token validation...');
        await fetchUserInfo();
      }, 5 * 60 * 1000); // 5 minutes
    }

    return () => {
      if (tokenValidationInterval) {
        clearInterval(tokenValidationInterval);
      }
    };
  }, [isAuthenticated]);

  const handleTokenExpired = async () => {
    console.log('Token expired or invalid, logging out...');
    await clearAuthData();
    setIsAuthenticated(false);
    setUser(null);
    router.replace('/login');
  };

  const clearAuthData = async () => {
    try {
      await AsyncStorage.removeItem('access_token');
      await AsyncStorage.removeItem('refresh_token');
      await AsyncStorage.removeItem('user_email');
      await AsyncStorage.removeItem('user_rfid');
      await AsyncStorage.removeItem('user_data');
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      if (!token) {
        await handleTokenExpired();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      });

      if (response.ok) {
        const userData = await response.json();
        await AsyncStorage.setItem('user_data', JSON.stringify(userData));
        setUser(userData);
        console.log('User info fetched successfully:', userData);
        console.log('User name:', userData.first_name, userData.last_name);
        console.log('User permission:', userData.permission_scope);
      } else if (response.status === 401) {
        // Token expired or invalid
        console.error('Token expired or invalid, status:', response.status);
        await handleTokenExpired();
      } else {
        console.error('Failed to fetch user info:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      // If network error, don't automatically log out
      // Just log the error and let the user try again
    }
  };

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const userData = await AsyncStorage.getItem('user_data');

      if (token && userData) {
        setIsAuthenticated(true);
        setUser(JSON.parse(userData));
        // Validate token by fetching user info
        await fetchUserInfo();
      } else if (token) {
        // If we have token but no user data, fetch it
        await fetchUserInfo();
        setIsAuthenticated(true);
      } else {
        // No token, redirect to login
        router.replace('/login');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      await handleTokenExpired();
    } finally {
      setLoading(false);
    }
  };

  const login = async (emailOrRfid: string, password?: string): Promise<boolean> => {
    try {
      // Determine if this is RFID authentication (no password provided) or manual login
      const isRfidAuth = !password;

      const requestBody: any = {};

      if (isRfidAuth) {
        // RFID authentication - only send rfid_token
        requestBody.rfid_token = emailOrRfid;
      } else {
        // Manual authentication - send username_or_email and password
        requestBody.username_or_email = emailOrRfid;
        requestBody.password = password;
      }

      console.log('Sending login request to:', `${API_BASE_URL}/auth/login`);
      console.log('Request body:', requestBody);
      console.log('Authentication method:', isRfidAuth ? 'RFID' : 'Manual');

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true', // Skip ngrok browser warning
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (response.ok) {
        const data = await response.json();
        console.log('Login successful:', data);

        // Store tokens
        await AsyncStorage.setItem('access_token', data.access_token);
        await AsyncStorage.setItem('refresh_token', data.refresh_token);

        // Store user identifier (email for manual login, RFID for RFID login)
        if (isRfidAuth) {
          // RFID authentication
          await AsyncStorage.setItem('user_rfid', emailOrRfid);
        } else {
          // Manual authentication
          await AsyncStorage.setItem('user_email', emailOrRfid);
        }

        // Fetch user information
        await fetchUserInfo();

        setIsAuthenticated(true);
        return true;
      } else {
        const errorText = await response.text();
        console.error('Login failed - Status:', response.status);
        console.error('Login failed - Response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          console.error('Login failed - Parsed error:', errorData);
        } catch (e) {
          console.error('Could not parse error response as JSON');
        }
        return false;
      }
    } catch (error) {
      console.error('Error during login:', error);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    console.log('Starting logout process...');

    try {
      // Get token for API call
      const token = await AsyncStorage.getItem('access_token');
      console.log('Retrieved token for logout:', token ? 'Token exists' : 'No token found');

      // Call logout endpoint if token exists
      if (token) {
        console.log('Making network call to logout endpoint...');
        console.log('API_BASE_URL:', API_BASE_URL);
        console.log('Full logout URL:', `${API_BASE_URL}/auth/logout`);
        console.log('Token being sent:', token.substring(0, 20) + '...');
        
        try {
          const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'ngrok-skip-browser-warning': 'true',
            },
          });

          console.log('Logout endpoint response received');
          console.log('Logout endpoint response status:', response.status);
          console.log('Logout endpoint response headers:', response.headers);
          
          if (response.ok) {
            console.log('Logout endpoint successful');
            const responseText = await response.text();
            console.log('Logout response body:', responseText);
          } else {
            const errorText = await response.text();
            console.error('Logout endpoint failed:', errorText);
          }
        } catch (fetchError) {
          console.error('Network error during logout:', fetchError);
        }
      } else {
        console.log('No token found, skipping network call');
      }

      // Always clear local storage regardless of API call result
      console.log('Clearing local storage...');
      await clearAuthData();

      console.log('Setting authentication state to false...');
      setIsAuthenticated(false);
      setUser(null);
      
      console.log('Redirecting to login page...');
      router.replace('/login');
      
      console.log('Logout completed successfully');
    } catch (error) {
      console.error('Error during logout process:', error);
      // Still clear local data and redirect even if there's an error
      await clearAuthData();
      setIsAuthenticated(false);
      setUser(null);
      router.replace('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}