import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
<<<<<<< HEAD
      cookieOptions: {
        sameSite: 'none',
        secure: true,
      },
=======
      // Secure cookies in production; not in dev, so localhost still works.
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
    },
  )
}
