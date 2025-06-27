/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat, FunctionCall, Type } from '@google/genai';

// --- TYPE DECLARATIONS for Google APIs ---
// These are simplified types to avoid TypeScript errors without installing full @types packages.
interface GapiClient {
  init: (args: { discoveryDocs: string[] }) => Promise<void>;
  getToken: () => { access_token: string } | null;
  setToken: (token: { access_token: string } | null) => void;
  calendar: {
    events: {
      list: (args: {
        calendarId: string;
        timeMin: string;
        timeMax: string;
        showDeleted: boolean;
        singleEvents: boolean;
        orderBy: string;
      }) => Promise<{ result: { items: any[] } }>;
    };
  };
}

declare const gapi: {
  load: (api: string, callback: () => void) => void;
  client: GapiClient;
};

interface TokenResponse {
  access_token: string;
  error?: any;
}

interface TokenClient {
  requestAccessToken: (options: { prompt: string }) => void;
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
      }) => TokenClient;
      revoke: (token: string, callback: () => void) => void;
    };
  };
};

// IMPORTANT: Replace with your Google Cloud client ID.
const CLIENT_ID = '396514019259-ltmo1f09gpbus4bp42tprb43m2o2vj13.apps.googleusercontent.com';

// To this
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

let tokenClient: TokenClient | null = null;
let chat: Chat | null = null;

// --- DOM ELEMENTS ---
const authContainer = document.getElementById('auth-container')!;
const chatContainer = document.getElementById('chat-container')!;
const authButton = document.getElementById('auth-button') as HTMLButtonElement;
const signoutButton = document.getElementById('signout-button')!;
const messageList = document.getElementById('message-list')!;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const loadingSpinner = document.getElementById('loading-spinner')!;

// --- GEMINI SETUP ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_calendar_events',
        description: "Get a list of events from the user's Google Calendar for a specific day.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            date: {
              type: Type.STRING,
              description: "The date to get events for, in YYYY-MM-DD format. If not provided, defaults to today.",
            },
          },
          required: [],
        },
      },
    ],
  },
];

// --- AUTHENTICATION & SCRIPT LOADING ---

function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: CALENDAR_SCOPE,
    callback: handleTokenResponse,
  });
}

function handleTokenResponse(resp: TokenResponse) {
  if (resp.error) {
    console.error('GIS Error:', resp.error);
    alert('Authentication failed. Please try again.');
    return;
  }
  gapi.client.setToken({ access_token: resp.access_token });
  updateUiForAuthState(true);
}

function handleAuthClick() {
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      gapi.client.setToken(null);
      updateUiForAuthState(false);
    });
  }
}

function updateUiForAuthState(isSignedIn: boolean) {
  if (isSignedIn) {
    authContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    initializeChat();
  } else {
    authContainer.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    chat = null;
    messageList.innerHTML = `
      <div class="message bot-message">
        <p>I'm ready! Ask me about your schedule, for example: "What do I have going on tomorrow?"</p>
      </div>`;
  }
}

// --- CALENDAR API ---
async function getCalendarEvents({ date }: { date?: string } = {}) {
  try {
    const today = new Date();
    const targetDate = date ? new Date(date) : today;
    // Adjust for timezone when creating date from string to avoid off-by-one day errors
    if (date) {
        targetDate.setMinutes(targetDate.getMinutes() + targetDate.getTimezoneOffset());
    }

    const timeMin = new Date(targetDate);
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(targetDate);
    timeMax.setHours(23, 59, 59, 999);

    const response = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      showDeleted: false,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return { events: response.result.items };
  } catch (error) {
    console.error('Calendar API Error:', error);
    return { error: 'Failed to fetch calendar events.' };
  }
}

// --- CHAT LOGIC ---
function initializeChat() {
  if (chat) return;
  chat = ai.chats.create({
    model: 'gemini-2.5-flash-preview-04-17',
    config: { tools },
  });
}

function appendMessage(role: 'user' | 'bot', text: string): HTMLElement {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message', `${role}-message`);
  messageEl.innerHTML = `<p>${text}</p>`;
  messageList.appendChild(messageEl);
  messageList.scrollTop = messageList.scrollHeight;
  return messageEl;
}

async function handleFormSubmit(e: Event) {
  e.preventDefault();
  if (!chat) {
    alert('Chat is not initialized. Please sign in again.');
    return;
  }
  const userInput = chatInput.value.trim();
  if (!userInput) return;

  chatInput.value = '';
  appendMessage('user', userInput);
  loadingSpinner.classList.remove('hidden');

  try {
    // Correctly call sendMessage with the user's prompt as a message object
    let response = await chat.sendMessage({ message: userInput });
    
    const functionCall = response.candidates?.[0]?.content?.parts?.find(
      (part) => part.functionCall
    )?.functionCall;

    if (functionCall) {
      if (functionCall.name === 'get_calendar_events') {
        const result = await getCalendarEvents(functionCall.args as any);
        // Correctly send the function response back as part of a message object
        response = await chat.sendMessage({
          message: [
            { functionResponse: { name: 'get_calendar_events', response: result } },
          ],
        });
      }
    }

    const botMessageText = (response.text || 'No response received').replace(/\n/g, '<br>');
    appendMessage('bot', botMessageText);
  } catch (error) {
    console.error('Gemini API Error:', error);
    appendMessage('bot', 'Sorry, I encountered an error. Please try again.');
  } finally {
    loadingSpinner.classList.add('hidden');
  }
}

// --- INITIALIZATION ---
function loadGoogleApiScripts() {
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  gapiScript.onload = () => gapiLoaded();
  document.head.appendChild(gapiScript);

  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.async = true;
  gsiScript.defer = true;
  gsiScript.onload = () => gisLoaded();
  document.head.appendChild(gsiScript);
}

loadGoogleApiScripts();

authButton.addEventListener('click', handleAuthClick);
signoutButton.addEventListener('click', handleSignoutClick);
chatForm.addEventListener('submit', handleFormSubmit);

if (CLIENT_ID !== '396514019259-ltmo1f09gpbus4bp42tprb43m2o2vj13.apps.googleusercontent.com') {
  alert('Please replace the CLIENT_ID with your actual Google Client ID.');
  authButton.disabled = true;
}