/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { TokenResponse, TokenClient, ConversationMessage } from './types_file';
import { 
  getCalendarEventsDeclaration, 
  createCalendarEventDeclaration,
  getCalendarEvents,
  createCalendarEvent,
  parseRelativeDate,
  parseDateTime
} from './calendarService';
import {
  isAudioMode,
  initializeSpeechRecognition,
  initializeSpeechSynthesis,
  speakText,
  setVoiceMessageButtonState
} from './audioService';

// IMPORTANT: Replace with your Google Cloud client ID.
const CLIENT_ID = '396514019259-ltmo1f09gpbus4bp42tprb43m2o2vj13.apps.googleusercontent.com';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// Global variables
let tokenClient: TokenClient | null = null;
let chat: any = null;
let conversationHistory: ConversationMessage[] = [];

// DOM elements
const authContainer = document.getElementById('auth-container')!;
const chatContainer = document.getElementById('chat-container')!;
const authButton = document.getElementById('auth-button') as HTMLButtonElement;
const signoutButton = document.getElementById('signout-button')!;
const messageList = document.getElementById('message-list')!;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const loadingSpinner = document.getElementById('loading-spinner')!;

// --- GEMINI SETUP ---
const ai = new GoogleGenAI({ apiKey: 'AIzaSyDq99cqG8Jn_paSIlDlGvptywaUqWz-KDs' });

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
    // Check if gapi is properly initialized
    if (typeof gapi === 'undefined' || !gapi.client) {
      alert('Google API is not ready. Please wait a moment and try again.');
      return;
    }
    
    tokenClient.requestAccessToken({ 
      prompt: 'consent'
    });
  } else {
    alert('Authentication client is not initialized. Please refresh the page.');
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
    initializeSpeechRecognition();
    initializeSpeechSynthesis();
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
  
  // If in audio mode and it's a bot message, speak the response
  if (isAudioMode && role === 'bot' && speechSynthesis) {
    speakText(text);
  }
  
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
  
  // Disable voice message button while processing
  setVoiceMessageButtonState(false);

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
    // Re-enable voice message button after response
    setVoiceMessageButtonState(true);
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

// Event listeners
authButton.addEventListener('click', handleAuthClick);
signoutButton.addEventListener('click', handleSignoutClick);
chatForm.addEventListener('submit', handleFormSubmit);

// Client ID validation
if (CLIENT_ID !== '396514019259-ltmo1f09gpbus4bp42tprb43m2o2vj13.apps.googleusercontent.com') {
  alert('Please replace the CLIENT_ID with your actual Google Client ID.');
  authButton.disabled = true;
}