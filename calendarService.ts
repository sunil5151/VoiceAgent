/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Type } from '@google/genai';

// Current date awareness constants
export const CURRENT_DATE = new Date(2025, 5, 27); // June 27, 2025

// Helper function to parse relative dates
export function parseRelativeDate(dateText: string): Date {
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

export function parseDateTime(dateTimeString: string): Date {
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

// Function declarations for calendar operations
export const getCalendarEventsDeclaration: FunctionDeclaration = {
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

export const createCalendarEventDeclaration: FunctionDeclaration = {
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

// Calendar API functions
export async function getCalendarEvents({ date }: { date?: string } = {}) {
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

export async function createCalendarEvent({ summary, description, startDateTime, endDateTime }: { 
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