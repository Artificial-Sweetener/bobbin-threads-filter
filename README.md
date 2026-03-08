# <img src="src/res/bobbin.png#gh-light-mode-only" alt="Bobbin" width="36"/> <img src="src/res/bobbin-white.png#gh-dark-mode-only" alt="Bobbin" width="36"/> Bobbin - Threads Filter

Threads can be great, but the algorithm will happily toss anything into your timeline if it thinks it'll get you to engage. **Bobbin** is the little sewing kit you pull out when you want your feed stitched back into shape.

I wanted a way to give automatic feedback to that algorithm. That's why Bobbin is fully configurable; it keeps the site feeling familiar while quietly removing the stuff you didn't ask for and, if you want, it can automatically send "Not Interested" back to Threads for the stuff you chose to filter.

## Installation

1. Install a userscript manager such as **[Violentmonkey](https://violentmonkey.github.io/)**, **[Tampermonkey](https://www.tampermonkey.net/)**, or **[FireMonkey](https://addons.mozilla.org/en-US/firefox/addon/firemonkey/)**.
2. Add the script: open [`bobbin-threads-filter.user.js`](https://raw.githubusercontent.com/Artificial-Sweetener/bobbin-threads-filter/main/bobbin-threads-filter.user.js) and let your userscript manager import it.
3. Reload Threads (`https://www.threads.net/` or `https://www.threads.com/`).

## Features

Bobbin is designed to make your browsing experience clean and completely under your control.

- **Filter Verified Users:** Hide posts from verified/blue-check accounts. This might seem silly to you, but in my experience a disproportionate number of these users are responsible for posting low quality bait content. You get a configurable whitelist for accounts you still want to see, so you don't lose the verified users you actually like.
- **Filter by Username:** Block specific handles from your timeline (user filters are exact-match handles, never regex).
- **Filter by Phrase or Regex:** Add phrase rules as plain text or regex entries, and tune them without touching code.
- **Filter Reposts Too:** Filters apply to reposts so you don't get "laundered" content from accounts you've filtered.
- **Filter AI Posts:** Hide posts marked with Threads' AI self-disclosure label. This only filters disclosed posts, not all AI content.
- **Filter Trending:** Hide all trending posts, or block specific trending topics.
- **Clean Up Suggestions:** Filter "Suggested for you" / Who to follow entries in the timeline.
- **Optional "Not Interested" Signaling:** This is the big one and part of why you might consider using Bobbin over Thread's built in filter: for phrase, username, and trending-topic filters, you can optionally tell Threads you're "Not Interested" automatically. In theory, this is like built in algo training, and it's conservatively rate limited so it doesn't look like bot behavior.

## Using the Control Panel

- Click the **Bobbin** icon in Threads; it shows up in the lower left... or, you can open it from your userscript manager menu. Either works to configure filters.
- Settings are stored locally by your userscript manager. If you're using the browser normally, it should remember across sessions, but if you're using private/incognito, just understand settings won't be saved in that case.
- **Profile pages:** Heads up!: Verified-user filtering is disabled on user profile pages so you can browse verified accounts normally. Other filters (including hiding verified badges) can still apply.

## Contributing & Support

- **Issues & Features:** Open an issue if Threads markup shifts or a filter stops working.
- **Pull Requests:** Yes please. Keep PRs focused and explain what you touched.
- **Build & Workflow:** See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

- **Project License:** GNU General Public License v3.0 (GPL-3.0-only). See [`LICENSE`](LICENSE).

The GPL keeps this script free forever: you can share it, tweak it, and improve it, as long as you pass those freedoms on.

## <img src="src/res/about.png" alt="about" width="36"/> From the Developer

I hope this script helps you reclaim your feed. I promise to be your ally in the fight against stuff you don't wanna see online.

- **Buy Me a Coffee**: You can help fuel more projects like this at my [Ko-fi page](https://ko-fi.com/artificial_sweetener).
- **My Website & Socials**: See my art, poetry, and other dev updates at [artificialsweetener.ai](https://artificialsweetener.ai).
- **If you like this project**, it would mean a lot to me if you gave it a star here on Github!! ⭐
