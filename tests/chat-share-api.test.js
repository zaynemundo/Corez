// @vitest-environment node
//
// Public chat shares are owner-created, read-only snapshots. The token is the
// only credential a visitor needs; revoking it must make both the transcript
// and its private assets unavailable.
import { describe, it, expect } from "vitest";
import { handleChatShares } from "../worker/chatShares.js";

const CHAT = {
  id: "chat-share-1",
  title: "Shared pottery notes",
  createdAt: 1000,
  userId: "dev",
};

function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      objects.set(key, String(value));
    },
    async get(key) {
      if (key === "users/dev/assets/photo.png") {
        return {
          body: new Blob(["image"]),
          httpEtag: "etag-photo",
          customMetadata: { ownerId: "dev" },
          writeHttpMetadata(headers) {
            headers.set("content-type", "image/png");
          },
          async text() {
            return "image";
          },
        };
      }
      const value = objects.get(key);
      if (!value) return null;
      return { async text() { return value; } };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function fakeEnv() {
  const messages = [
    {
      role: "user",
      content: "Show me this room\n\n![room](/api/assets/photo.png)",
      attachments: null,
      createdAt: 1001,
    },
    {
      role: "assistant",
      content: "This is a warm, grounded starting point.",
      attachments: null,
      createdAt: 1002,
    },
  ];
  return {
    ENVIRONMENT: "test",
    ASSET_BUCKET: fakeBucket(),
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async first() {
            if (sql.includes("FROM chats")) return CHAT;
            return null;
          },
          async all() {
            if (sql.includes("FROM chat_messages")) {
              return { results: messages };
            }
            return { results: [] };
          },
          async run() {
            return {};
          },
        };
      },
    },
  };
}

function request(path, method = "GET") {
  return new Request(`http://localhost${path}`, { method });
}

describe("public chat shares", () => {
  it("creates a snapshot, serves it publicly, then revokes it", async () => {
    const env = fakeEnv();
    const created = await handleChatShares(
      request("/api/chats/chat-share-1/share", "POST"),
      env,
    );
    expect(created.status).toBe(201);
    const share = await created.json();
    expect(share.shared).toBe(true);
    expect(share.url).toContain("/share/chat/");

    const status = await handleChatShares(
      request("/api/chats/chat-share-1/share"),
      env,
    );
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      shared: true,
      url: share.url,
    });

    const publicResponse = await handleChatShares(
      request(`/api/share/chat/${share.token}`),
      env,
    );
    expect(publicResponse.status).toBe(200);
    const publicShare = await publicResponse.json();
    expect(publicShare.title).toBe("Shared pottery notes");
    expect(publicShare.messages).toHaveLength(2);
    expect(publicShare.uid).toBeUndefined();
    expect(publicShare.assetKeys).toBeUndefined();
    expect(publicShare.messages[0].content).toContain(
      `/api/share/chat/${share.token}/asset/photo.png`,
    );

    const asset = await handleChatShares(
      request(`/api/share/chat/${share.token}/asset/photo.png`),
      env,
    );
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("image/png");

    const removed = await handleChatShares(
      request("/api/chats/chat-share-1/share", "DELETE"),
      env,
    );
    expect(removed.status).toBe(200);

    const gone = await handleChatShares(
      request(`/api/share/chat/${share.token}`),
      env,
    );
    expect(gone.status).toBe(404);
    const goneAsset = await handleChatShares(
      request(`/api/share/chat/${share.token}/asset/photo.png`),
      env,
    );
    expect(goneAsset.status).toBe(404);
  });

  it("returns the same link when a chat is shared twice", async () => {
    const env = fakeEnv();
    const first = await (
      await handleChatShares(
        request("/api/chats/chat-share-1/share", "POST"),
        env,
      )
    ).json();
    const second = await (
      await handleChatShares(
        request("/api/chats/chat-share-1/share", "POST"),
        env,
      )
    ).json();
    expect(second.token).toBe(first.token);
  });

  it("rejects an unauthenticated share in production", async () => {
    const env = { ...fakeEnv(), ENVIRONMENT: "production" };
    const response = await handleChatShares(
      request("/api/chats/chat-share-1/share", "POST"),
      env,
    );
    expect(response.status).toBe(401);
  });
});
