// Address of the Cloudflare Worker that talks to Claude and makes the HD voice (see README).
// Leave empty to run without AI features: built-in dialogues and reference comparison still work.
export const API_URL = "https://api.earandpen.net";

// Firebase project for sign-in and syncing progress between devices (see README).
// These values only identify the project; the data is protected by firestore.rules. null = sync off.
export const FIREBASE = null;
