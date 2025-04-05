#!/usr/bin/env node
/**
 * Chat Data Management Script
 * 
 * This script provides commands to manage chat data:
 * - Clear all messages from all rooms
 * - Reset user counts in all rooms
 * - Both of the above
 * 
 * Usage:
 *   node clear-chat-data.js [options]
 * 
 * Options:
 *   --messages   Clear all messages
 *   --users      Reset user counts
 *   --all        Clear messages and reset user counts (default)
 *   --help       Display this help message
 */

import fetch from 'node-fetch';

// Base URL for API endpoints (adjust if needed)
const API_BASE_URL = "https://ryoai.xyz/api/chat-rooms';

async function clearAllMessages() {
  console.log('Clearing all chat messages...');
  try {
    const response = await fetch(`${API_BASE_URL}?action=clearAllMessages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Success:', data.message);
      return true;
    } else {
      console.error('❌ Error:', data.error || 'Failed to clear messages');
      return false;
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return false;
  }
}

async function resetUserCounts() {
  console.log('Resetting user counts and clearing online users...');
  try {
    const response = await fetch(`${API_BASE_URL}?action=resetUserCounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Success:', data.message);
      return true;
    } else {
      console.error('❌ Error:', data.error || 'Failed to reset user counts');
      return false;
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Chat Data Management Script

This script provides commands to manage chat data:
- Clear all messages from all rooms
- Reset user counts in all rooms
- Both of the above

Usage:
  node clear-chat-data.js [options]

Options:
  --messages   Clear all messages
  --users      Reset user counts
  --all        Clear messages and reset user counts (default)
  --help       Display this help message
    `);
    return;
  }
  
  // Default to --all if no specific options provided
  const shouldClearMessages = args.includes('--messages') || args.includes('--all') || args.length === 0;
  const shouldResetUsers = args.includes('--users') || args.includes('--all') || args.length === 0;
  
  console.log('Starting chat data cleanup...');
  
  if (shouldClearMessages) {
    const messagesResult = await clearAllMessages();
    if (!messagesResult) {
      console.log('Failed to clear messages.');
    }
  }
  
  if (shouldResetUsers) {
    const usersResult = await resetUserCounts();
    if (!usersResult) {
      console.log('Failed to reset user counts.');
    }
  }
  
  console.log('Chat data cleanup complete!');
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 