import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://cwatxpuxttgeceahbciw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3YXR4cHV4dHRnZWNlYWhiY2l3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MjkyMDYsImV4cCI6MjA5NjIwNTIwNn0.qDucNfJDg5MF2nv63w9HUcjYjFitxlJOQq9OL6NsoHw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
