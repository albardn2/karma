import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Set per build profile in eas.json (dev/preview -> api-dev, production ->
// api-prod) and overridable via .env for local `expo start`; resolved by
// app.config.ts into expo config extra.
const API_BASE_URL: string =
  Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://api-prod.karma-grp.com';

/**
 * Any 2xx is a success.
 *
 * Not every read in this API answers 200 — GET
 * /customer-order/with-items-and-invoice/<uuid> returns 201 — and screens that
 * tested for exactly 200 rendered a perfectly good response as a load failure.
 */
export const isOk = (status: number) => status >= 200 && status < 300;

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

// Registered by AuthContext so a failed refresh routes the user to login.
let onAuthFailure: (() => void) | null = null;
export const setOnAuthFailure = (handler: (() => void) | null) => {
  onAuthFailure = handler;
};

export const PERMS_VERSION_HEADER = 'X-Perms-Version';

// Registered by AuthContext so a permission change re-reads /auth/me.
let onPermsChanged: (() => void) | null = null;
export const setOnPermsChanged = (handler: (() => void) | null) => {
  onPermsChanged = handler;
};

// The fingerprint the cached `user` object is consistent with. Deliberately not
// persisted: on a cold start AuthContext re-reads /auth/me anyway, so the first
// response of the session seeds this and there is nothing to go stale.
let knownPermsVersion: string | null = null;

/**
 * Notice, from any response, that this user's permissions are no longer what the
 * cached profile says.
 *
 * The server revokes on the next request; the app was the stale half, holding a
 * menu built at mount until it was force-quit. Every response carries the current
 * fingerprint, so ordinary traffic is the discovery channel — no poll, no push.
 *
 * The new version is adopted BEFORE the handler runs, which is what stops a loop:
 * the /auth/me call the handler makes returns this same version, so it reads as a
 * match instead of triggering another refresh, forever.
 */
const notePermsVersion = (response: Response) => {
  const version = response.headers.get(PERMS_VERSION_HEADER);
  if (!version) return;
  if (knownPermsVersion === null) {
    knownPermsVersion = version;
    return;
  }
  if (version === knownPermsVersion) return;
  knownPermsVersion = version;
  onPermsChanged?.();
};

const clearStoredAuth = async () => {
  await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user_email', 'user_data']);
  // so the next user to sign in on this device is not compared against the
  // previous one's fingerprint
  knownPermsVersion = null;
};

// 'ok' = new access token stored; 'rejected' = refresh token invalid/expired
// (log the user out); 'network' = transient failure (keep the session).
type RefreshResult = 'ok' | 'rejected' | 'network';

// Single-flight: many parallel 401s trigger exactly one refresh request.
let refreshPromise: Promise<RefreshResult> | null = null;

const refreshAccessToken = (): Promise<RefreshResult> => {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<RefreshResult> => {
      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (!refreshToken) return 'rejected';

      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${refreshToken}`,
          },
        });
        if (!response.ok) return 'rejected';

        const data = await response.json();
        if (!data?.access_token) return 'rejected';

        await AsyncStorage.setItem('access_token', data.access_token);
        return 'ok';
      } catch (error) {
        // offline / flaky connection: don't kill the session over it
        console.error('Token refresh network error:', error);
        return 'network';
      }
    })();
    refreshPromise.finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

const doFetch = async (endpoint: string, options: RequestInit): Promise<Response> => {
  const token = await AsyncStorage.getItem('access_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  // checked here rather than in apiCall so it covers the retried request too,
  // and every caller regardless of status: a 403 is the response most likely to
  // be the first sign that permissions moved.
  notePermsVersion(response);
  return response;
};

export const apiCall = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  try {
    let response = await doFetch(endpoint, options);

    // access token expired: refresh once and retry the original request
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed === 'ok') {
        response = await doFetch(endpoint, options);
      } else if (refreshed === 'rejected') {
        await clearStoredAuth();
        onAuthFailure?.();
        return {
          status: 401,
          error: 'Session expired',
        };
      } else {
        // transient network problem during refresh: surface the error but
        // keep the tokens so the next attempt can succeed
        return {
          status: 401,
          error: 'Network error during session refresh',
        };
      }
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
