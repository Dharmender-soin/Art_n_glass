-- Migration: Add 'hold' to public.work_status enum type
ALTER TYPE public.work_status ADD VALUE IF NOT EXISTS 'hold';
