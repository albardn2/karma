import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, apiCall, setOnAuthFailure } from '@/utils/api';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
  user: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // when a token refresh fails mid-session, drop straight to the login screen
    setOnAuthFailure(() => {
      setIsAuthenticated(false);
      setUser(null);
    });
    checkAuthStatus();
    return () => setOnAuthFailure(null);
  }, []);

  const clearAuthData = async () => {
    try {
      await AsyncStorage.removeItem('access_token');
      await AsyncStorage.removeItem('refresh_token');
      await AsyncStorage.removeItem('user_email');
      await AsyncStorage.removeItem('user_data');
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  };

  const fetchUserInfo = async (): Promise<boolean> => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      if (!token) {
        await clearAuthData();
        setIsAuthenticated(false);
        setUser(null);
        return false;
      }

      // apiCall handles 401 -> refresh -> retry transparently
      const response = await apiCall('/auth/me');

      if (response.status === 200 && response.data) {
        const userData = response.data;
        await AsyncStorage.setItem('user_data', JSON.stringify(userData));
        setUser(userData);
        return true;
      }

      await clearAuthData();
      setIsAuthenticated(false);
      setUser(null);
      return false;
    } catch (error) {
      console.error('Error fetching user info:', error);
      await clearAuthData();
      setIsAuthenticated(false);
      setUser(null);
      return false;
    }
  };

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('access_token');
      const userData = await AsyncStorage.getItem('user_data');

      if (token && userData) {
        setUser(JSON.parse(userData));
        const isValid = await fetchUserInfo();
        setIsAuthenticated(isValid);
        if (!isValid) {
          setUser(null);
        }
      } else if (token) {
        const isValid = await fetchUserInfo();
        setIsAuthenticated(isValid);
        if (!isValid) {
          setUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const requestBody = {
        username_or_email: email,
        password: password,
      };

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();

        await AsyncStorage.setItem('access_token', data.access_token);
        await AsyncStorage.setItem('refresh_token', data.refresh_token);
        await AsyncStorage.setItem('user_email', email);

        const userFetched = await fetchUserInfo();
        if (userFetched) {
          setIsAuthenticated(true);
          return true;
        }
        return false;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Error during login:', error);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const token = await AsyncStorage.getItem('access_token');

      if (token) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      await clearAuthData();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
      await clearAuthData();
      setIsAuthenticated(false);
      setUser(null);
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
