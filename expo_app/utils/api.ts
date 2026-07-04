import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://api-prod.karma-grp.com';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

export const apiCall = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  try {
    const token = await AsyncStorage.getItem('access_token');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fullUrl = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      return {
        status: 401,
        error: 'Token expired',
      };
    }

    if (response.ok) {
      const data = await response.json();
      return {
        status: response.status,
        data,
      };
    }

    const errorText = await response.text();
    return {
      status: response.status,
      error: errorText,
    };
  } catch (error) {
    console.error('API call error:', error);
    return {
      status: 0,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
};

export { API_BASE_URL };
