import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://horuzytvjcysjstdglsm.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvcnV6eXR2amN5c2pzdGRnbHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMDAwMTQsImV4cCI6MjEwMDg3NjAxNH0.YACr1NlzxIHgxpmttGp7VeBzcLYvFtJbw-rWQf_1KNI'
  return createBrowserClient(url, key)
}
