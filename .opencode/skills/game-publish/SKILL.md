---
name: game-publish
description: Producer and marketing skill for the Market stage — launching finished browser games on distribution platforms, press kits, festivals, streamers, and social media.
version: 1.0.0
tags: [publish, launch, marketing, distribution, press-kit, itch, community]
dependencies: [game-release-check]
token_estimate: 500
---

# Game Publish Skill

The final stage of the game pipeline. Applies AFTER `game-release-check` signoff: the game is finished, tested, and verified — this skill ships it to players and tells people it exists.

---

## 1. Distribution Platforms (pick per target)

| Platform | Type | Cost | Notes |
|----------|------|------|-------|
| itch.io | PC/Web | Free | Best default for browser games; instant page, supports HTML5 embedding |
| Newgrounds | Web | Free | Strong for browser games; active community voting |
| Kongregate | Web | Free | Browser focus; larger competition |
| Game Jolt | PC/Web | Free | Good indie community |
| GitHub Pages | Web | Free | Simple static hosting via `user.github.io/repo` |
| Google Play | Mobile | $25 one-time | Needs wrapper (e.g. Capacitor) for web games |
| Steam | PC | $100/game | Steam Direct; requires desktop build |

For a CoreZ browser game the default is: **itch.io page + GitHub Pages demo link**, then optionally a storefront per the user's goal.

### Page essentials (every platform)
- Title, tagline, and the **hook** from `game-brainstorm` (vision.pitch)
- 3-5 screenshots or a GIF of real gameplay (from `game-visual-review` captures)
- Controls list (keyboard AND touch)
- Link to the live game — one click from the page
- Build/version info (`game-release-check` output) so players report real versions

---

## 2. Press Kit

A press kit (`docs/presskit/` in the game project) makes coverage easy. Include:
- `presskit.md` — one-page: game description, hook, 3 key features, developer story (2-3 sentences), release date, platform links
- 2-4 gameplay screenshots (PNG, ≥1280px wide)
- Logo/game icon (256x256+)
- Contact email + social handles
- Controls sheet (one page)

Do NOT invent: sales figures, awards, review quotes, or "players love it" claims.

---

## 3. Getting Coverage

### Press
- Email writers/magazines **about the game, not yourself** — short, compelling, with screenshots/GIFs
- Send to outlets that actually cover the genre/platform; don't mass-blast everyone
- Share the unlisted page ~1 week before launch; writers need lead time
- A presskit() (dopresskit.com) page helps writers grab assets

### Festivals (optional, timed)
| Festival | Typical Deadline |
|----------|------------------|
| Independent Games Festival (IGF) | ~October |
| IndieCade | ~May/June |
| SXSW Gaming | ~December |
| The Game Awards (fan vote) | ~November |

Festivals suit ambitious games; skip for SMALL casual projects.

### Streamers/YouTubers
- Reach out with a short pitch + key art, offer a demo link (no keys needed for web games)
- Short, specific pitches outperform generic ones

### Social media
- Post the hook + gameplay GIF on launch day and weekly after
- Use tags like `#gamedev #indiedev #screenshotsaturday`
- Reddit: post in relevant subreddits (e.g. `r/WebGames`, `r/IndieGaming`) following their self-promo rules

---

## 4. Launch Checklist

- [ ] Game passed `game-release-check` (all gates green, evidence collected)
- [ ] Page drafted on each target platform (unlisted until launch)
- [ ] Press kit complete in `docs/presskit/`
- [ ] Screenshots/GIFs from real gameplay (no placeholder art)
- [ ] Controls documented on the page
- [ ] Live demo link verified on a fresh browser + mobile viewport
- [ ] Analytics or at least a play counter configured if available
- [ ] Known-issues list (`game-release-check`) published honestly on the page
- [ ] Launch posts drafted (itch.io, social, community) and scheduled
- [ ] Press contacted at least one week before launch
- [ ] Attribution section lists all CC assets (see `game-polish` audio sources)

## 5. Post-Launch

- Collect bug reports via the page's comment/issue channel and route to `game-bug-triage`
- Track one metric that matters (plays, level-completion, retention) — report it in the next iteration
- Update the page with a patch log after fixes
- Not every launch is a hit: a released game + lessons learned is a successful iteration

---

## 6. Anti-Patterns

| Anti-Pattern | Why It Fails | Better Approach |
|---|---|---|
| Marketing before the game is fun | Players bounce; word-of-mouth dies | Polish + playtest first (`game-qa-plan` §6), then market |
| Press contact on launch day | No lead time for writers | Contact 1+ week early with unlisted page |
| Fake testimonials/stats | Trust destroyed instantly | Only real numbers from real play |
| One post, then silence | Algorithm visibility dies | Weekly posts with new GIFs/screenshots |
| Ignoring mobile viewport | Mobile players see broken layout | Verify live demo on phone before sharing |
