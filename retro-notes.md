# Labs OS 2: retro notes

*Written straight after the build. What was asked, how it was split, what broke, and what is still weak.*

-----

## 1. The brief

Verbatim:

> take a look at Labs OS in the labs admin panel. open it, read it, understand it, the source code is on github. we are going to make Labs OS V2 - based on all the amazing work we've been doing with the v3 configurator and the brand new and almighty composer project. take Labs OS - build a version 2, keep the humour, make references to things in the codebase but really elevate it to the next level - omarchy style, bodacious, advanced, hackeresque, and a statement of our times. just the right amount of intentional jankyness to make it funny but fully functional - use a version of gristle with a sense of humour for reviews. build it - ask no questions, no blockers, then stick it on my github as a new repo Labs OS v2

No clarifying questions were asked. The decisions that followed from the brief:

| Decision | Why |
|---|---|
| A DOM tiling desktop, not a canvas | 3.1 owned the 640x360 pixel look. A riced Linux desktop is about sharp text, gaps, borders and keys. |
| The subject is the Composer and the v3 configurator | The brief names them. Every joke is checked against a list of real facts from the labs repo (`BRIEF.md`). |
| A shared spend ledger with the real daily cap | The "statement of our times": everything thinks, and everything that thinks costs money. |
| The 3.1 build runs inside 2.0 | Keeps the humour of the original, literally. |
| Public repo with GitHub Pages, like 3.1 | 3.1 is public and served from Pages. The same tone rules apply: no real people, no real brands, nothing private. |

-----

## 2. What exists

- `index.html`: about 1.4 MB, one file, no network. About 300 KB of that is the 3.1 build and the icon set.
- 17,860 lines of source: a 2,500-line kernel and twelve apps.
- 14 registered apps, 9 themes, 6 wallpapers drawn in code, 22 Composer stages with their real approach names.

-----

## 3. How the work was split

The same shape as 3.1, because it worked: find the serial part, write the contract, then build in parallel.

1. **Kernel first, alone.** The window manager, bar, launcher, overlays, filesystem, spend ledger, command registry, 3D renderer and themes. Every app depends on these; nothing else does.
2. **The contract.** `API.md` (the app API) and `BRIEF.md` (tone rules, the fact sheet, and a spec per app) were written before any app.
3. **Six agents in parallel**, each on its own files, building to its own output file (`build.py --out`) and driving its own browser port, so no two touched the same bytes or the same Chrome.

| Agent | Apps | Time | Tool calls |
|---|---|---|---|
| 1 | brickty (terminal) | 49 min | 104 |
| 2 | labvim, Gristle | 58 min | 92 |
| 3 | Composer | 78 min | 139 |
| 4 | Configurator, Design Review | 73 min | 168 |
| 5 | lanetop, ultracode, Planning Oracle 2 | 35 min | 91 |
| 6 | Gold Labeller, Issue Lifecycle | 59 min | 133 |

Each agent was told to read every screenshot it took as an image. Two of them also ran their own review pass before reporting.

**Kernel requests from the agents** (all actioned): the notification CSS class `.note` collided with an app's table cell; the bar's clock overlapped the spend meter at 900 px; a critical notification had no way to be dismissed; `/gold` was read-only only for `rm`, not for writes; keys reached a window while focus sat on a bar button; ground faces were drawn over shadows; and my own data listed the buggy approach as the `align_floors` default. The Composer agent caught that last one, which was the right way round: the fact sheet was wrong and the app was right.

-----

## 4. The review: Gristle, Comedy Edition

The team's Gristle reviewer, with the same rules (verify every finding, quote the line, do not inflate taste into High) and one change: it may be funny, and it reviews the jokes as well as the code. The prompt is `tools/gristle-comedy.md`.

Three reviewers ran in parallel, split by file. They found 69 findings, 4 of them High.

| Scope | Findings | High | Gristle says |
|---|---|---|---|
| Composer, Configurator, Design Review | 17 | 0 | "twenty-two stages, ten design reviews and a loan all add up, which is more than the cost breakdown manages." |
| labvim, Gristle, lanetop, ultracode, Oracle, Gold, Lifecycle | 25 | 2 | "the editor undoes too much, the Oracle reads "not detached" as detached, and my own boring fixes delete your saves, so I have marked myself High and I am not pleased about it." |
| Kernel, terminal, system apps, tools | 27 | 2 | "A real shell over a fake disk, with real bugs under the fake ones; give the British their hash key back, and stop rebooting Bricky into a choir." |

The four High findings:

1. **lanetop showed a real AI vendor's file name on screen.** Renamed to `CLOD.md`, after the parody CLI.
2. **Gristle's "Apply the boring fixes" wrote back the text it had reviewed**, so a save made after the review was lost. It now reads the file again and refuses if it changed.
3. **On a Mac, Option+3 is how a UK keyboard types `#`.** Alt+digit switched workspace instead, even in the terminal. Characters that Option types now win inside a text field, and Ctrl+Alt+digit always switches.
4. **The boot log named a real cloud storage product.** It now fails to start `bucket-cors.service`.

Four fix agents, again split by file, fixed every finding. The kernel findings I fixed myself. One fix changed a contract (crash panels now attach to the window frame, so they cover a scrolled window), and three apps that looked for the panel in the old place were told and updated before they shipped.

The reviewers were right about things the builders and I had all looked at and missed: the "prices by area alone" joke was false because materials changed the price; the P14 label blamed the fix for the bug; a "recessed" door was drawn sticking out; Bricky said the width was always 3 m when the real fact is that no width exists in the payload. A joke that misstates a fact is a bug, and these were bugs.

-----

## 5. Bugs, in the order they hurt

- **`window.OS` was undefined.** A top-level `const` does not become a property of `window`, so the screenshot tool waited 15 seconds for nothing on the first run. One line: `window.OS = OS`.
- **The launcher's command mode did nothing.** `>uptime` was put through the fuzzy filter, which dropped the "Run: uptime" item because its name has no `>` in it. Found by the terminal agent, not by me.
- **Typing "Gold" in the launcher picked the Gold Standard theme**, not the Gold Labeller, because the length penalty counted the app's search keywords. Then "Gold" picked the Composer, whose keywords contain "gold". Matches in the name now outrank matches in keywords, and apps outrank actions.
- **Every reboot added a Bricky.** `startSession` started his toast timer again each time. After three reboots he spoke four times as often and the first tile was a fifth of the screen.
- **Alt+H moved focus to a window hidden under a fullscreen one**, and typing went into the window nobody could see.

-----

## 6. Still weak

Honest list.

- Pipes now stream: `ping labs | head -3` prints three lines and stops. One difference from bash remains: a command that does not read its input, placed after one that never ends (`ping labs | echo hi`), waits for Ctrl+C before it runs.
- On Windows and Linux, Chrome closes the tab on Ctrl+W before the page sees it. The terminal offers Alt+Backspace instead and says so in `help`.
- The painter's algorithm still sorts badly from extreme orbit angles, most visibly under the overhang of the deliberately enormous house.
- lanetop is a canvas, so its text cannot be selected or read by a screen reader.
- The gold photos are flat front views. Believable, and repetitive at the detail level.
- The Oracle's paragraph references come from memory of the 2015 order, not from the legal text.
- The configurator and design review use a system UI font while everything else is monospace. That is on purpose (it is a parody of a polished product inside a hacker's desktop), but it is the one place the shell's look stops.

-----

## 7. What I would keep

1. **Write the fact sheet before the jokes.** Twelve apps written by six authors stayed consistent because they all drew from one list of true things. The reviewers then checked jokes against the same list.
2. **One build output and one browser port per agent.** Parallel agents that share a build file or a debugger port fail in ways that look like their own bugs.
3. **Review the jokes like code.** Four of the most useful findings were jokes that were not true.
4. **Look at the output.** Every agent read every screenshot. The clipped price in round 9, the four-pixel Rationale column and the cut boot log on a phone were found by looking, not by reading code.

*Bricky says: "I am still 32 by 32. They offered me vectors. I said no."*
