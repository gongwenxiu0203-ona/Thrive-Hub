import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Routes accessible without a session.
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/pending",
  "/intake",
  "/api/intake",
  "/api/auth",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Already signed in but visiting /login or /register → send to dashboard.
  // Guest sessions are excluded — guests should be able to reach /login to upgrade.
  if ((pathname === "/login" || pathname === "/register") && session && session.role !== "GUEST") {
    const userStatus = session.status ?? "APPROVED";
    if (userStatus === "PENDING") {
      return NextResponse.redirect(new URL("/pending", req.url));
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isPublic) return NextResponse.next();

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect PENDING users to /pending (except /pending itself and logout)
  const userStatus = session.status ?? "APPROVED";
  if (userStatus === "PENDING" && pathname !== "/pending" && !pathname.startsWith("/api/auth")) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "账号审核中，请等待管理员审批" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/pending", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
