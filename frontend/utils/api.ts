import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://fe37-2605-cb80-1009-1-e061-7d0-e89f-a457.ngrok-free.app';

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

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fullUrl = `${API_BASE_URL}${endpoint}`;
    console.log('Making API call to:', fullUrl);
    console.log('Headers:', headers);

    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    if (response.status === 401) {
      // Token expired - clear storage and redirect will be handled by AuthContext
      await AsyncStorage.removeItem('access_token');
      await AsyncStorage.removeItem('refresh_token');
      await AsyncStorage.removeItem('user_email');
      await AsyncStorage.removeItem('user_rfid');
      await AsyncStorage.removeItem('user_data');

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