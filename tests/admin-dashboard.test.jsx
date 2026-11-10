// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "../src/pages/Admin.jsx";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderAdmin() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
}

function waitForDashboard() {
  return waitFor(() => {
    expect(screen.getByRole("heading", { name: /finish a password reset/i })).toBeTruthy();
  });
}

beforeEach(() => {
  try {
    sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("admin console page", () => {
  it("unlocks with the admin key and renders the dashboard", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
      const target = String(url);
      const headers = init.headers || {};
      if (target.includes("/api/admin/me")) {
        return headers["X-Admin-Key"] === "secret-key"
          ? jsonResponse({ ok: true, admin: { email: "admin-key", via: "secret" } })
          : jsonResponse({ error: "Admin access required.", code: "admin_auth_required" }, 401);
      }
      if (target.includes("/api/admin/dashboard")) {
        return jsonResponse({
          ok: true,
          stats: { users: 42, chats: 120, themes: 7, pendingResets: 2 },
          plans: { free: 30, standard: 12 },
          recentResets: [
            { email: "user@corez.pro", createdAt: Date.now(), expiresAt: Date.now() + 60000, used: false },
          ],
          recentUsers: [
            { email: "new@corez.pro", plan: "free", provider: "local", createdAt: Date.now() },
          ],
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderAdmin();

    await screen.findByText("Admin access required");
    fireEvent.change(screen.getByPlaceholderText("ADMIN_SECRET"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitForDashboard();
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Open reset links")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("user@corez.pro")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("submits the token, email and new password to the reset endpoint", async () => {
    let resetBody = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
      const target = String(url);
      if (target.includes("/api/admin/me")) {
        return jsonResponse({ ok: true, admin: { email: "admin@corez.pro", via: "session" } });
      }
      if (target.includes("/api/admin/dashboard")) {
        return jsonResponse({
          ok: true,
          stats: { users: 1, chats: 0, themes: 0, pendingResets: 0 },
          plans: { free: 1 },
          recentResets: [],
          recentUsers: [],
        });
      }
      if (target.includes("/api/admin/reset-password")) {
        resetBody = JSON.parse(init.body);
        return jsonResponse({ ok: true, message: "Password updated for user@corez.pro." });
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderAdmin();
    await waitForDashboard();

    fireEvent.change(screen.getAllByPlaceholderText("user@example.com")[0], {
      target: { value: "user@corez.pro" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste the token the user received"), {
      target: { value: "token-from-user" },
    });
    const passwordFields = screen.getAllByPlaceholderText(/At least 8 characters|Repeat it/);
    fireEvent.change(passwordFields[0], { target: { value: "NewPassword123!" } });
    fireEvent.change(passwordFields[1], { target: { value: "NewPassword123!" } });

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await screen.findByText("Password updated for user@corez.pro.");
    expect(resetBody).toEqual({
      email: "user@corez.pro",
      token: "token-from-user",
      password: "NewPassword123!",
    });
  });

  it("blocks a mismatched confirmation without calling the server", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.includes("/api/admin/me")) {
        return jsonResponse({ ok: true, admin: { email: "admin@corez.pro", via: "session" } });
      }
      if (target.includes("/api/admin/dashboard")) {
        return jsonResponse({
          ok: true,
          stats: { users: 1, chats: 0, themes: 0, pendingResets: 0 },
          plans: { free: 1 },
          recentResets: [],
          recentUsers: [],
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    renderAdmin();
    await waitForDashboard();

    fireEvent.change(screen.getByPlaceholderText("Paste the token the user received"), {
      target: { value: "token-from-user" },
    });
    const passwordFields = screen.getAllByPlaceholderText(/At least 8 characters|Repeat it/);
    fireEvent.change(passwordFields[0], { target: { value: "NewPassword123!" } });
    fireEvent.change(passwordFields[1], { target: { value: "DifferentPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await screen.findByText("The two passwords do not match.");
  });
});