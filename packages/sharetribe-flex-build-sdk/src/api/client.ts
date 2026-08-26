/**
 * Sharetribe API client
 *
 * Handles authentication and API requests to Sharetribe backend
 */

import { get, post, del, request, postTransit, HttpResponse } from './http-client.js';
import { createMultipartBody, MultipartField } from './multipart.js';
import { encodeTransit, decodeTransit } from './transit.js';
import { readAuth } from '../auth-storage.js';
import { getApiBaseUrl } from '../config.js';

// Re-export MultipartField for use in commands
export type { MultipartField };

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

/**
 * Gets authentication headers from provided API key or auth file
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @returns Authorization headers
 */
function getAuthHeaders(apiKey?: string): Record<string, string> {
  let key = apiKey;

  if (!key) {
    const auth = readAuth();
    if (!auth) {
      throw new Error('Not logged in. Please provide apiKey or run: sharetribe-community-cli login');
    }
    key = auth.apiKey;
  }

  return {
    Authorization: `Apikey ${key}`,
  };
}

/**
 * Handles API response and errors
 */
function handleResponse<T>(response: HttpResponse): T {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    if (response.body) {
      return JSON.parse(response.body) as T;
    }
    return {} as T;
  }

  // Parse error response
  let errorData: { errors?: Array<{ code: string; message?: string }> } = {};
  try {
    errorData = JSON.parse(response.body);
  } catch {
    // Ignore parse errors
  }

  const firstError = errorData.errors?.[0];
  const error: ApiError = {
    code: firstError?.code || 'UNKNOWN_ERROR',
    message: firstError?.message || `HTTP ${response.statusCode}`,
    status: response.statusCode,
  };

  throw error;
}

/**
 * Makes a GET request to the API
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @param endpoint - API endpoint path
 * @param queryParams - Optional query parameters
 * @returns API response
 */
export async function apiGet<T>(apiKey: string | undefined, endpoint: string, queryParams?: Record<string, string>): Promise<T> {
  const url = new URL(getApiBaseUrl() + endpoint);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await get(url.toString(), getAuthHeaders(apiKey));
  return handleResponse<T>(response);
}

/**
 * Makes a POST request to the API
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @param endpoint - API endpoint path
 * @param queryParams - Optional query parameters
 * @param body - Request body
 * @returns API response
 */
export async function apiPost<T>(
  apiKey: string | undefined,
  endpoint: string,
  queryParams?: Record<string, string>,
  body?: unknown
): Promise<T> {
  const url = new URL(getApiBaseUrl() + endpoint);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await post(url.toString(), body, getAuthHeaders(apiKey));
  return handleResponse<T>(response);
}

/**
 * Makes a DELETE request to the API
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @param endpoint - API endpoint path
 * @param queryParams - Optional query parameters
 * @returns API response
 */
export async function apiDelete<T>(
  apiKey: string | undefined,
  endpoint: string,
  queryParams?: Record<string, string>
): Promise<T> {
  const url = new URL(getApiBaseUrl() + endpoint);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await del(url.toString(), getAuthHeaders(apiKey));
  return handleResponse<T>(response);
}

/**
 * Makes a multipart form-data POST request to the API
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @param endpoint - API endpoint path
 * @param queryParams - Query parameters
 * @param fields - Multipart form fields
 * @returns API response
 */
export async function apiPostMultipart<T>(
  apiKey: string | undefined,
  endpoint: string,
  queryParams: Record<string, string>,
  fields: MultipartField[]
): Promise<T> {
  const url = new URL(getApiBaseUrl() + endpoint);
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const { body, contentType } = createMultipartBody(fields);

  const headers = {
    ...getAuthHeaders(apiKey),
    'Content-Type': contentType,
    'Content-Length': body.length.toString(),
  };

  const response = await request(url.toString(), {
    method: 'POST',
    headers,
    body,
  });
  return handleResponse<T>(response);
}

/**
 * Makes a POST request to the API with Transit-encoded body
 * Transit is a data format used by the Sharetribe API for certain endpoints
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @param endpoint - API endpoint path
 * @param queryParams - Query parameters
 * @param body - Request body (will be Transit-encoded)
 * @returns API response
 */
export async function apiPostTransit<T>(
  apiKey: string | undefined,
  endpoint: string,
  queryParams: Record<string, string>,
  body: unknown
): Promise<T> {
  const url = new URL(getApiBaseUrl() + endpoint);
  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const transitBody = encodeTransit(body);
  const response = await postTransit(url.toString(), transitBody, getAuthHeaders(apiKey));

  // Parse Transit response
  if (response.statusCode >= 400) {
    const errorData = decodeTransit(response.body) as any;
    const firstError = errorData.errors?.[0];
    const error: ApiError = {
      code: firstError?.code || 'UNKNOWN_ERROR',
      message: firstError?.title || `HTTP ${response.statusCode}`,
      status: response.statusCode,
    };
    throw error;
  }

  return decodeTransit(response.body) as T;
}
