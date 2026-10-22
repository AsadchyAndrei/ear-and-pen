// Address of the Cloudflare Worker that talks to Claude and makes the HD voice (see README).
// Leave empty to run without AI features: built-in dialogues and reference comparison still work.
export const API_URL = "https://api.earandpen.net";

// Firebase project for sign-in and syncing progress between devices (see README).
// These values only identify the project; the data is protected by firestore.rules. null = sync off.
export const FIREBASE = {
  apiKey: "AIzaSyAp361u8l1DufZYC0F83haq50vPXg9mybQ",
  authDomain: "ear-and-pen.firebaseapp.com",
  projectId: "ear-and-pen",
  storageBucket: "ear-and-pen.firebasestorage.app",
  messagingSenderId: "1032004993393",
  appId: "1:1032004993393:web:37049af23f6b90de8bb6d0",
};
