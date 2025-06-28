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
export let isRecordingVoiceMessage = false;

// DOM elements for audio functionality
export const textModeButton = document.getElementById('text-mode-button') as HTMLButtonElement;
export const audioModeButton = document.getElementById('audio-mode-button') as HTMLButtonElement;
export const micButton = document.getElementById('mic-button') as HTMLButtonElement;
export const chatInput = document.getElementById('chat-input') as HTMLInputElement;
export const chatForm = document.getElementById('chat-form') as HTMLFormElement;
export const voiceMessageButton = document.getElementById('voice-message-button') as HTMLButtonElement;

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
  
  // Modify the existing recognition.onresult handler to work with voice messages
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatInput.value = transcript;
    
    // Auto-submit after speech recognition if it was a voice message
    if (transcript.trim() && isRecordingVoiceMessage) {
      isRecordingVoiceMessage = false;
      voiceMessageButton.classList.remove('recording');
      chatForm.dispatchEvent(new Event('submit'));
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    isListening = false;
    micButton.classList.remove('recording');
  };
}

// Add this function to handle voice message recording
export function handleVoiceMessageButtonClick() {
  if (!recognition) return;
  
  if (isRecordingVoiceMessage) {
    // Stop recording
    recognition.stop();
    isRecordingVoiceMessage = false;
    voiceMessageButton.classList.remove('recording');
  } else {
    // Start recording
    recognition.start();
    isRecordingVoiceMessage = true;
    voiceMessageButton.classList.add('recording');
  }
}

// Add this function to disable/enable the voice message button
export function setVoiceMessageButtonState(enabled: boolean) {
  voiceMessageButton.disabled = !enabled;
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
    
    // Automatically activate voice message button after bot finishes speaking
    if (isAudioMode && !isRecordingVoiceMessage) {
      setTimeout(() => {
        handleVoiceMessageButtonClick();
      }, 500); // Small delay to ensure UI is ready
    }
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
voiceMessageButton.addEventListener('click', handleVoiceMessageButtonClick);

// Initialize in text mode by default
switchToTextMode();