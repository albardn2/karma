import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, apiCall, setOnAuthFailure, setOnPermsChanged } from '@/utils/api';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
  user: any;
  isAdmin: boolean;
  /** False only while the signed-in user's company is awaiting verification. */
  isVerified: boolean;
  /** Re-reads /auth/me — how the verification notice notices it was verified. */
  refreshUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // when a token refresh fails mid-session, drop straight to the login screen
    setOnAuthFailure(() => {
      setIsAuthenticated(false);
      setUser(null);
    });
    // An admin changed this user's role, permissions or the company's feature cap.
    // Re-read the profile so the menu stops offering what they can no longer use —
    // previously this only happened on a cold start, which on a phone that is never
    // force-quit could be weeks.
    setOnPermsChanged(() => {
      refreshProfile();
    });
    checkAuthStatus();

    // The header only arrives on a response, so it needs traffic — and a user
    // sitting on the menu generates none. Resuming the app is the moment that
    // matters in practice: the change was made while the phone was in a pocket,
    // and this is when they look at it again.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshProfile();
    });

    return () => {
      setOnAuthFailure(null);
      setOnPermsChanged(null);
      appStateSub.remove();
    };
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

  /**
   * Re-read the profile WITHOUT risking the session.
   *
   * fetchUserInfo signs the user out on any non-200, which is right at startup —
   * a bad token must not leave a half-signed-in app — and wrong for an
   * opportunistic refresh: resuming in a tunnel with no signal would log the user
   * out over a network blip. This applies a newer profile when one arrives and
   * otherwise changes nothing.
   *
   * A genuinely dead session still ends: apiCall's 401 path refreshes the token
   * and, if that is rejected, fires onAuthFailure — the existing machinery.
   */
  const refreshProfile = async () => {
    try {
      const response = await apiCall('/auth/me');
      if (response.status === 200 && response.data) {
        await AsyncStorage.setItem('user_data', JSON.stringify(response.data));
        setUser(response.data);
      }
    } catch (error) {
      console.error('Profile refresh failed, session kept:', error);
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

  const scopes = String(user?.permission_scope ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAdmin = scopes.includes('admin') || scopes.includes('superuser');
  // Compared against `false` explicitly rather than tested for truthiness: the
  // field is absent from an older backend's response and from a `user_data`
  // payload cached before this feature shipped, and neither of those may lock a
  // working account out of the app. Superusers are sent `true` by the server, so
  // nothing here needs to re-derive platform-owner status.
  const isVerified = user?.account_verified !== false;

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, login, logout, loading, user, isAdmin, isVerified,
               refreshUser: fetchUserInfo }}
    >
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
