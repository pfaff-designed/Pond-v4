import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/auth']

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let {
    data: { user },
  } = await supabase.auth.getUser()

  // DEV-ONLY auth bypass: auto-login as a fixed dev user so local work skips the
  // magic-link flow. Gated behind DEV_AUTOLOGIN — unset it to restore normal auth.
  // Server-only env (no NEXT_PUBLIC): the dev password never reaches the browser bundle.
  if (
    !user &&
    process.env.DEV_AUTOLOGIN === '1' &&
    process.env.DEV_EMAIL &&
    process.env.DEV_PASSWORD
  ) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.DEV_EMAIL,
      password: process.env.DEV_PASSWORD,
    })
    if (!error) user = data.user
  }

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (user && request.nextUrl.pathname.startsWith('/sign-in')) {
    return NextResponse.redirect(new URL('/workspace', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
