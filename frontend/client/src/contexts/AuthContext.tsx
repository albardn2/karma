import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_BASE_URL } from '../lib/config';

interface User {
  uuid: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  permissionScope?: string;
  /** comma-separated scopes as returned by /auth/me, e.g. "superuser,admin" */
  permission_scope?: string;
  phoneNumber?: string;
  language?: string;
}

interface SignupData {
  company_name: string;
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  email?: string;
  phone_number?: string;
  language?: string;
}

interface SignupResult {
  success: boolean;
  /** backend-provided error message (e.g. username taken), when available */
  error?: string;
}

interface AuthContextType {
  user: User | null;
  login: (emailOrRfid: string, password?: string) => Promise<boolean>;
  signup: (data: SignupData) => Promise<SignupResult>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        mode: 'cors',
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('auth_token');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (emailOrRfid: string, password?: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      // Determine if this is RFID login (no password) or username/password login
      const loginData = password 
        ? { username_or_email: emailOrRfid, password }
        : { rfid_token: emailOrRfid };

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        mode: 'cors',
        body: JSON.stringify(loginData),
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.access_token) {
          localStorage.setItem('auth_token', data.access_token);
          
          // Fetch user data after successful login
          const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${data.access_token}`,
              'ngrok-skip-browser-warning': 'true',
            },
            mode: 'cors',
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUser(userData);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Company signup: mirrors login — store the token, then fetch /auth/me so
  // the user lands signed-in. HTTP errors resolve to { success: false, error };
  // network failures throw so callers can show a network-error toast.
  const signup = async (data: SignupData): Promise<SignupResult> => {
    try {
      setIsLoading(true);

      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        mode: 'cors',
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();

        if (result.access_token) {
          localStorage.setItem('auth_token', result.access_token);

          // Fetch user data after successful signup (same flow as login)
          const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${result.access_token}`,
              'ngrok-skip-browser-warning': 'true',
            },
            mode: 'cors',
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUser(userData);
            return { success: true };
          }
        }

        return { success: false };
      }

      // 400 etc. — body is {"msg": ...} or plain pydantic error text
      let message: string | undefined;
      try {
        const raw = await response.text();
        message = raw || undefined;
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.msg === 'string') {
            message = parsed.msg;
          }
        } catch {
          // not JSON — keep the raw text
        }
      } catch {
        // ignore body read failures
      }
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const scopes = (user?.permission_scope ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const value: AuthContextType = {
    user,
    login,
    signup,
    logout,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: scopes.includes('admin') || scopes.includes('superuser'),
  };

  return (
    <AuthContext.Provider value={value}>
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