/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, FunctionDeclaration, Type, FunctionCallingConfigMode } from '@google/genai';

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
      insert: (args: {
        calendarId: string;
        resource: any;
      }) => Promise<{ result: any }>;
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

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// Add these variables after the existing variable declarations (around line 60)
let tokenClient: TokenClient | null = null;
let chat: any = null;

// Add these new variables
let conversationHistory: Array<{role: string, parts: Array<{text?: string, functionCall?: any, functionResponse?: any}>}> = [];

// Current date awareness constants
const CURRENT_DATE = new Date(2025, 5, 27); // June 27, 2025

// Helper function to parse relative dates
function parseRelativeDate(dateText: string): Date {
  const result = new Date(CURRENT_DATE);
  
  if (dateText.toLowerCase().includes('tomorrow')) {
    result.setDate(CURRENT_DATE.getDate() + 1); // June 28, 2025
  } else if (dateText.toLowerCase().includes('yesterday')) {
    result.setDate(CURRENT_DATE.getDate() - 1); // June 26, 2025
  } else if (dateText.toLowerCase().includes('today')) {
    // Already set to CURRENT_DATE
  } else if (dateText.toLowerCase().includes('next week')) {
    result.setDate(CURRENT_DATE.getDate() + 7);
  } else {
    // Try to parse as a specific date
    const specificDate = new Date(dateText);
    if (!isNaN(specificDate.getTime())) {
      return specificDate;
    }
  }
  
  return result;
}

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

// Function declarations for calendar operations
const getCalendarEventsDeclaration: FunctionDeclaration = {
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
};

const createCalendarEventDeclaration: FunctionDeclaration = {
  name: 'create_calendar_event',
  description: "Create a new event in the user's Google Calendar.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "The title/summary of the event.",
      },
      description: {
        type: Type.STRING,
        description: "Optional description of the event.",
      },
      startDateTime: {
        type: Type.STRING,
        description: "Start date and time of the event in ISO format or natural language (e.g., '2023-12-15T15:00:00' or 'next Monday at 3pm').",
      },
      endDateTime: {
        type: Type.STRING,
        description: "End date and time of the event in ISO format or natural language (e.g., '2023-12-15T17:00:00' or 'next Monday at 5pm').",
      },
    },
    required: ["summary", "startDateTime", "endDateTime"],
  },
};

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
    conversationHistory = []; // Reset conversation history
    messageList.innerHTML = `
      <div class="message bot-message">
        <p>I'm ready! Today is Friday, June 27, 2025. Ask me about your schedule or to create events. For example: "What do I have going on tomorrow?" or "Schedule a team meeting next Tuesday at 2pm."</p>
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

async function createCalendarEvent({ summary, description, startDateTime, endDateTime }: { 
  summary: string; 
  description?: string; 
  startDateTime: string; 
  endDateTime: string;
}) {
  try {
    const event = {
      summary,
      description,
      start: {
        dateTime: new Date(startDateTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: new Date(endDateTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    const response = await gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    return { 
      success: true, 
      event: response.result 
    };
  } catch (error) {
    console.error('Calendar API Error:', error);
    return { 
      success: false, 
      error: 'Failed to create calendar event.' 
    };
  }
}

// --- CHAT LOGIC ---
function initializeChat() {
  if (chat) return;
  // Initialize chat using the new API
  chat = ai.chats;
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
    // Add user message to conversation history
    conversationHistory.push({
      role: 'user',
      parts: [{ text: userInput }]
    });

    // Generate content using the conversation history for context
    let response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: conversationHistory,
      config: {
        tools: [{
          functionDeclarations: [getCalendarEventsDeclaration, createCalendarEventDeclaration]
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO
          }
        }
      }
    });

    // Check if there are function calls to execute
    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionCall = response.functionCalls[0];
      let functionResult;

      if (functionCall.name === 'get_calendar_events') {
        // Parse the date if it's a relative date
        const args = functionCall.args as any;
        if (args.date) {
          const parsedDate = parseRelativeDate(args.date);
          args.date = parsedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
        functionResult = await getCalendarEvents(args);
      } else if (functionCall.name === 'create_calendar_event') {
        const args = functionCall.args as any;
        
        // Parse start and end times if they contain relative dates
        if (args.startDateTime) {
          const parsedStartDate = parseDateTime(args.startDateTime);
          args.startDateTime = parsedStartDate.toISOString();
        }
        
        if (args.endDateTime) {
          const parsedEndDate = parseDateTime(args.endDateTime);
          args.endDateTime = parsedEndDate.toISOString();
        }
        
        functionResult = await createCalendarEvent(args);
      }

      if (functionResult) {
        // Add the function call and response to conversation history
        conversationHistory.push({
          role: 'model',
          parts: [{ functionCall: functionCall }]
        });
        
        conversationHistory.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: functionCall.name,
              response: functionResult
            }
          }]
        });

        // Generate final response with function result
        response = await ai.models.generateContent({
          model: 'gemini-2.0-flash-001',
          contents: conversationHistory,
          config: {
            tools: [{
              functionDeclarations: [getCalendarEventsDeclaration, createCalendarEventDeclaration]
            }]
          }
        });
      }
    }

    // Add model response to conversation history
    conversationHistory.push({
      role: 'model',
      parts: [{ text: response.text || 'No response received' }]
    });

    const botMessageText = (response.text || 'No response received').replace(/\n/g, '<br>');
    appendMessage('bot', botMessageText);
  } catch (error) {
    console.error('Gemini API Error:', error);
    appendMessage('bot', 'Sorry, I encountered an error. Please try again.');
  } finally {
    loadingSpinner.classList.add('hidden');
  }
}

function parseDateTime(dateTimeString: string): Date {
  // Try to parse as ISO format first
  const isoDate = new Date(dateTimeString);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }
  
  // Start with our reference date (June 27, 2025)
  const baseDate = new Date(CURRENT_DATE);
  
  // Handle relative dates
  if (dateTimeString.toLowerCase().includes('tomorrow')) {
    baseDate.setDate(CURRENT_DATE.getDate() + 1); // June 28, 2025
  } else if (dateTimeString.toLowerCase().includes('yesterday')) {
    baseDate.setDate(CURRENT_DATE.getDate() - 1); // June 26, 2025
  } else if (dateTimeString.toLowerCase().includes('next week')) {
    baseDate.setDate(CURRENT_DATE.getDate() + 7);
  }
  
  // Extract time if specified
  const timeMatch = dateTimeString.match(/(\d+)(?:\s*)(?::|am|pm|AM|PM)/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    
    // Handle AM/PM
    if (dateTimeString.toLowerCase().includes('pm') && hour < 12) {
      hour += 12;
    } else if (dateTimeString.toLowerCase().includes('am') && hour === 12) {
      hour = 0;
    }
    
    baseDate.setHours(hour);
    
    // Try to extract minutes
    const minuteMatch = dateTimeString.match(/:([0-5][0-9])/);
    if (minuteMatch) {
      baseDate.setMinutes(parseInt(minuteMatch[1]));
    } else {
      baseDate.setMinutes(0);
    }
    
    baseDate.setSeconds(0);
    baseDate.setMilliseconds(0);
  }
  
  return baseDate;
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