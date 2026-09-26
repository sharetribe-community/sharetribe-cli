/**
 * Admin identity lookup
 *
 * Backs the login command, which verifies an API key before storing it.
 */

import { apiGet } from './api/client.js';

export interface CurrentAdmin {
  /** Email address of the admin the API key belongs to */
  email: string;
}

/**
 * Fetches the admin an API key belongs to
 *
 * flex-cli's login calls this before writing the key to auth.edn, so a key that
 * the Build API rejects is never stored. A bad key raises the SDK's ApiError
 * with status 401, which the CLI renders as its access denied page.
 *
 * @param apiKey - Key to verify. Unlike the other SDK calls this is required,
 *   since the point is to check a key that is not stored yet.
 * @returns The admin's email address
 */
export async function getCurrentAdmin(apiKey: string): Promise<CurrentAdmin> {
  const response = await apiGet<{ data: { 'admin/email': string } }>(
    apiKey,
    '/current_admin/show',
    {}
  );

  return { email: response.data['admin/email'] };
}
