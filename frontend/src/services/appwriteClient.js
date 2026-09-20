/**
 * Appwrite Browser Client (Safe for Public Frontend)
 *
 * Uses the Appwrite Web SDK with project ID only.
 * NEVER expose APPWRITE_API_KEY in the frontend.
 *
 * Authentication & session management happen via this client.
 * For authenticated backend requests, call account.createJWT()
 * and send the JWT as a Bearer token in the Authorization header.
 */

import { Client, Account, Databases, Storage } from 'appwrite';

const ENDPOINT   = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;

let client = null;
let account = null;
let databases = null;
let storage = null;

const isAppwriteConfigured = !!PROJECT_ID;

if (isAppwriteConfigured) {
  client = new Client();
  client
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID);

  account = new Account(client);
  databases = new Databases(client);
  storage = new Storage(client);
} else {
  console.info(
    '[Appwrite] VITE_APPWRITE_PROJECT_ID not set — running frontend in local API mode.'
  );
}

export { client, account, databases, storage, isAppwriteConfigured };
export default client;
