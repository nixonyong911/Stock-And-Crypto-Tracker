'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RegisterUserData {
  phone_number: string;
  telegram_username: string | null;
  display_name: string;
}

interface RegisterResult {
  success: boolean;
  error?: string;
}

export async function registerUser(data: RegisterUserData): Promise<RegisterResult> {
  try {
    const supabase = createServerSupabaseClient();

    // Validate phone number format
    const phoneRegex = /^\+\d{7,20}$/;
    if (!phoneRegex.test(data.phone_number)) {
      return {
        success: false,
        error: 'Invalid phone number format. Please include country code (e.g., +60123456789)',
      };
    }

    // Validate display name
    if (!data.display_name || data.display_name.trim().length < 2) {
      return {
        success: false,
        error: 'Display name must be at least 2 characters',
      };
    }

    // Validate telegram username if provided
    if (data.telegram_username) {
      const usernameRegex = /^[a-zA-Z0-9_]{5,32}$/;
      if (!usernameRegex.test(data.telegram_username)) {
        return {
          success: false,
          error: 'Telegram username must be 5-32 characters (letters, numbers, underscores only)',
        };
      }
    }

    // Insert into telegram_users table
    const { error: insertError } = await supabase
      .from('telegram_users')
      .insert({
        phone_number: data.phone_number,
        telegram_username: data.telegram_username,
        display_name: data.display_name.trim(),
      });

    if (insertError) {
      // Handle duplicate phone number
      if (insertError.code === '23505') {
        return {
          success: false,
          error: 'This phone number is already registered. Please use /login in Telegram.',
        };
      }
      
      console.error('Database error:', insertError);
      return {
        success: false,
        error: 'Failed to register. Please try again later.',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    };
  }
}
