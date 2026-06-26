-- Migration: Add user_fcm_tokens table for push notifications
-- Date: 2026-06-24
-- Purpose: Store Firebase Cloud Messaging (FCM) tokens for native devices

CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  device_platform TEXT, -- 'android' or 'ios'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can insert, update, read, and delete their own device tokens
CREATE POLICY "Users can manage their own FCM tokens"
  ON public.user_fcm_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for quick lookups by user ID when sending notifications
CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user_id ON public.user_fcm_tokens(user_id);
