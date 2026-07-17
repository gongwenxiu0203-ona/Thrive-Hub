import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isRouteBlocked, getRoleLanding } from "@/lib/permissions";

// Routes accessible without a session.
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/pending",
  "/forgot-password",
  "/reset-password",
  "/intake",
  "/api/intake",
  "/api/auth",
  "/contract-fill",        // 外部合同填写链接（无需登录）
  "/api/contract-fill",    // 外部填写提交 API
];

// Sensitive legacy assets may still exist under public/ during the staged
// migration. They must never be served directly; authenticated APIs read them
// server-side only as a temporary compatibility fallback.
const BLOCKED_STATIC_PREFIXES = [
  "/contracts-generated",
  "/contracts-stamped",
  "/contract-templates",
  "/contract-annotations",
  "/seal",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/signature-party-b.png" ||
    BLOCKED_STATIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Already signed in but visiting /login or /register → send to role landing.
  if ((pathname === "/login" || pathname === "/register") && session) {
    const userStatus = session.status ?? "APPROVED";
    if (userStatus === "PENDING") {
      return NextResponse.redirect(new URL("/pending", req.url));
    }
    return NextResponse.redirect(new URL(getRoleLanding(session.role), req.url));
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

  // Block roles from pages they shouldn't access (BRAND / CHANNEL restrictions).
  if (!pathname.startsWith("/api/") && isRouteBlocked(pathname, session.role)) {
    return NextResponse.redirect(new URL(getRoleLanding(session.role), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
