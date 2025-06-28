/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpeechRecognition, SpeechRecognitionConstructor } from './types_file';

// Audio mode variables
export let isAudioMode = false;
export let recognition: SpeechRecognition | null = null;
export let speechSynthesis: SpeechSynthesis | null = null;
export let isSpeaking = false;
export let isListening = false;

// DOM elements for audio functionality
export const textModeButton = document.getElementById('text-mode-button') as HTMLButtonElement;
export const audioModeButton = document.getElementById('audio-mode-button') as HTMLButtonElement;
export const micButton = document.getElementById('mic-button') as HTMLButtonElement;
export const chatInput = document.getElementById('chat-input') as HTMLInputElement;
export const chatForm = document.getElementById('chat-form') as HTMLFormElement;

// --- SPEECH RECOGNITION ---
export function initializeSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech recognition not supported in this browser');
    audioModeButton.disabled = true;
    return;
  }
  
  const SpeechRecognitionClass: SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognitionClass();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add('recording');
  };
  
  recognition.onend = () => {
    isListening = false;
    micButton.classList.remove('recording');
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatInput.value = transcript;
    // Auto-submit after speech recognition
    if (transcript.trim()) {
      chatForm.dispatchEvent(new Event('submit'));
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    isListening = false;
    micButton.classList.remove('recording');
  };
}

export function toggleSpeechRecognition() {
  if (!recognition) return;
  
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

// --- SPEECH SYNTHESIS ---
export function initializeSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser');
    return;
  }
  
  speechSynthesis = window.speechSynthesis;
}

export function speakText(text: string) {
  if (!speechSynthesis) return;
  
  // Stop any current speech
  if (isSpeaking) {
    speechSynthesis.cancel();
  }
  
  // Clean up the text (remove HTML tags)
  const cleanText = text.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '');
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onstart = () => {
    isSpeaking = true;
  };
  
  utterance.onend = () => {
    isSpeaking = false;
  };
  
  utterance.onerror = (event) => {
    console.error('Speech synthesis error', event);
    isSpeaking = false;
  };
  
  speechSynthesis.speak(utterance);
}

// --- INPUT MODE SWITCHING ---
export function switchToTextMode() {
  isAudioMode = false;
  textModeButton.classList.add('active');
  audioModeButton.classList.remove('active');
  micButton.classList.add('hidden');
  chatInput.placeholder = 'Ask about your calendar...';
  chatInput.disabled = false;
  chatInput.focus();
}

export function switchToAudioMode() {
  isAudioMode = true;
  audioModeButton.classList.add('active');
  textModeButton.classList.remove('active');
  micButton.classList.remove('hidden');
  chatInput.placeholder = 'Speak or type your question...';
}

// Event listeners for audio functionality
textModeButton.addEventListener('click', switchToTextMode);
audioModeButton.addEventListener('click', switchToAudioMode);
micButton.addEventListener('click', toggleSpeechRecognition);

// Initialize in text mode by default
switchToTextMode();