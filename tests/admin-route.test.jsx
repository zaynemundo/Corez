// @vitest-environment jsdom
// /admin is a public SPA route so the operator can unlock it with ADMIN_SECRET
// before signing in; this pins the route wiring, not the API behaviour.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "../src/App.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/admin route", () => {
  it("renders the operator console instead of the app or sign-in", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.includes("/api/admin/me")) {
        return new Response(
          JSON.stringify({ error: "Admin access required.", code: "admin_auth_required" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (target.includes("/api/auth/me")) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    });

    window.history.pushState({}, "", "/admin");
    render(<App />);

    expect(await screen.findByText("Admin access required")).toBeTruthy();
    expect(screen.getByPlaceholderText("ADMIN_SECRET")).toBeTruthy();
  });
});
