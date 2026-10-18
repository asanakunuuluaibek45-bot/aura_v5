import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

<<<<<<< HEAD
function redirectWithSupabaseCookies(response: NextResponse, destination: URL) {
  const redirectResponse = NextResponse.redirect(destination)
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
  return redirectResponse
}

=======
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

<<<<<<< HEAD
  const path = request.nextUrl.pathname
  const isAuthRoute = path.startsWith("/auth")
  const isLoginOrHomeRoute =
    path === "/" || path === "/auth/login" || path === "/auth/login/"
  const isPublicAsset =
    path.startsWith("/api") ||
    path === "/sw.js" ||
    path === "/manifest.json" ||
    path === "/manifest.webmanifest" ||
    path === "/site.webmanifest" ||
    path === "/robots.txt" ||
    path === "/favicon.ico"
  const isPublicStore = path === "/" || path === "/store" || path.startsWith("/store/")

  // Gracefully handle missing Supabase environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // Fail closed for private app routes when auth cannot be verified.
    if (!isAuthRoute && !isPublicAsset && !isPublicStore) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        sameSite: "none",
        secure: true,
      },
=======
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

<<<<<<< HEAD
  // Authenticated users should not see the public landing or login form.
  if (user && isLoginOrHomeRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/crm/pos"
    url.search = ""
    return redirectWithSupabaseCookies(supabaseResponse, url)
  }

  // Not logged in and trying to reach a protected app route -> send to login
  if (!user && !isAuthRoute && !isPublicAsset && !isPublicStore) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return redirectWithSupabaseCookies(supabaseResponse, url)
=======
  const path = request.nextUrl.pathname
  const isAuthRoute = path.startsWith("/auth")
  const isPublicAsset = path.startsWith("/api")

  // Not logged in and trying to reach a protected app route -> send to login
  if (!user && !isAuthRoute && !isPublicAsset) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
>>>>>>> 6517ddcf80422f00951dd9ac12bf4744f0ceb4f6
  }

  return supabaseResponse
}
