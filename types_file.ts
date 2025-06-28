/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- TYPE DECLARATIONS for Google APIs ---
// These are simplified types to avoid TypeScript errors without installing full @types packages.
export interface GapiClient {
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

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
  interpretation: any;
}

export interface TokenResponse {
  access_token: string;
  error?: any;
}

export interface TokenClient {
  requestAccessToken: (options: { prompt: string }) => void;
}

// Speech Recognition Constructor type
export interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

// Global declarations
declare global {
  const gapi: {
    load: (api: string, callback: () => void) => void;
    client: GapiClient;
  };

  const google: {
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

  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

// Conversation history type
export interface ConversationMessage {
  role: string;
  parts: Array<{
    text?: string;
    functionCall?: any;
    functionResponse?: any;
  }>;
}