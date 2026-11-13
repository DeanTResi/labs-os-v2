# Labs OS 2: the brief

Labs OS 3.1 was a 640x360 vintage-Windows comedy OS. Labs OS 2 is its successor: a modern tiling desktop in the style of a riced Arch Linux with a Hyprland-type compositor. It is terminal-first, keyboard-driven, themeable, dense and fast. The subject is what the Labs team builds now: the v3 configurator (Vite, Inertia, React, five design reviews) and the Composer (a 22-stage pipeline that composes a 3D house from a property listing, scored against human "gold" answers, with a daily model-spend cap).

It must be funny, and it must work. Every app has real state and real interaction. Some apps fail on purpose, always through `OS.crash(...)` and always in a way that fits what the app claims to be. The jank is intentional, controlled and readable as a joke. It must never look like a real bug: no overflow, no unreadable text, no console errors.

-----

## Tone rules

1. **Deadpan.** The joke is a specific, true detail, stated flatly. 3.1's best jokes were the ones closest to the source. Prefer a real fact from this brief to an invented one.
2. **British English.** Colour, storey, metres, £.
3. **No real people.** No names of colleagues, users or anyone else. Roles are fine: "product design", "the designer", "an engineer", "a lane".
4. **No real companies, products or brands in visible text.** Invent them. The AI coding CLI is `clod`. Model names may appear only as the approach file names below (they are our code). Do not name real AI vendors, real estate portals, real cloud providers or real chat apps.
5. **Nothing private.** No internal URLs, host names, email addresses, keys, customer data or real street addresses. Invented addresses only.
6. **Mock process and documents, never people.** Users of the product are treated kindly. The target is the machinery: reviews, pipelines, caps, rituals, agents.
7. **Short copy.** One-line jokes. No exclamation marks (Bricky may have one, once).
8. **The statement of our times:** everything has an agent, everything thinks, everything costs money, everything is benchmarked against gold, every UI gets one more design review, and the result is reported as "not worse than main".

-----

## Facts you can use (all true of the labs codebase)

**Composer**
- 22 stages, in order, with page codes: tag_images P1, site_context S1, house_box F1, describe_house F2, orient_plan P4, floor_boxes P2, floor_outlines P3, gable_ends P11, read_rooms P6, plan_scale P7, plan_sheet P14, align_floors P5, projections P13, floor_cells P8, floor_diff P12, detect_features P9, mark_features P10, massing M1, roofer M2, decorate M3, wall_materials M5, composed_model M4. `OS.data.stages` has them with their real approach names.
- Display numbers come from position: adding a stage renumbers every later stage ("6 · Floor outlines" becomes "7 · ...").
- Approach naming: `<model or method>_<inputs>_<number>`, e.g. `terra_satellite_1`. Once an approach is on main its output never changes. A different prompt is a new numbered file. Never rename one, because stored runs record them.
- Real fixes, as commit subjects: "stop a neighbouring drawing joining a floor's outline (own_drawing_1)"; "floor_boxes: stop the wall snap taking a neighbouring drawing into the floor (luna_storeycount_2)"; "read each floor's box from its walls, so neighbouring drawings stay out (luna_storeycount_3)"; "tag_images: front before rear; earliest outside photo when no front (luna_order_1)"; "mark_features front_snap_1: snap front windows boxed behind the wall onto it"; "massing door_fit_1: cut doors at their detected width"; "align_floors reads light-walled plans, so their upper storey is built (light_walls_1)"; "Cap the plan sheet's scale factor; an out-of-range factor leaves the tile unscaled"; "chalet roofs and real dormers for storeys in the roof"; "decorate: downpipes from the main roof front gutter"; "Conservatories in the composed model, and a demolish flourish"; "Roofer step shows ridge, hip and valley lines instead of contour lines"; "Massing leaves out a cellar the storeys do not list".
- Floor plans numbered from 1: "the drawing labelled 1 is ground only when the image has one drawing per storey".
- Storeys: ground = 0, first = 1, lower ground = -1. Left and right are as seen from the street.
- Heightmaps are greyscale. Black is low (eaves), white is high (ridge).
- Composer builds on a 0.5 m grid across the front. Vertically the unit is one storey (2.7 m). There is no vertical grid.
- Composed models and models built from the correct answers both score about 5/10 against the photos. "So the kit and the question list limit the result, not the reading."
- Gold: human answers per house. Gold houses 158, 152, 135 and 178 are the reliable examples. Held-out (test) houses are never shown to tuning. "Can't tell" becomes `unknown`. A gap in a gable line is valid. Gold is never edited, only overridden.
- Spend: a hypothesis note may spend $10.00; a day may spend $100.00 (UTC). The real refusal text: "H-12 has spent $9.80 of its $10.00 cap (next run ≈ $1.20). Stop this experiment: write it up with composer_benchmark:conclude (it creates the follow-on notes), then start the next experiment on one of them." and "Today's experiment spend is $98.10 of the $100.00 daily cap (UTC). Conclude your current experiment and stop until tomorrow."
- An experiment ends with a write-up: the finding stated as positive, negative or inconclusive, plus follow-on hypotheses as linked notes. Agents may chain experiments unattended.
- Any change to fingerprinted Composer paths needs an end-to-end benchmark run that shows "✓ not worse than main" before merge.
- Dev sets: named subsets of houses. "smoke is the seeded dev set, the MD5 pick is gone".
- There are two 3D viewers. Textures live in only one of them.
- The extensions spike composes rear, side and side infill extensions. "Grey only: no materials, new openings or pitched roofs yet."
- The image bucket has no CORS.
- Z-fighting needs same-facing coplanar overlap.

**v3 configurator**
- Vite + Inertia + React, strictly separate from the v2 Stimulus pipeline. Never mix them.
- Extension types: Rear extension, Side extension, Side infill, Loft, Wraparound (and "Existing" for none). Sizes Small, Medium, Large.
- Option categories: Type, Size, Wall material, Roof material. "Chips name the surface they paint."
- `DISPLAY_WIDTH_M = 3`: "The cost engine prices by area alone. No width or depth exists anywhere in the payload, so the m x m readout is a display convention, not a quoted spec." A loft shows m² instead.
- Real PR titles: "Configurator redesign fixes from the round 1 design review" through "round 5". "Price bar with See breakdown". "VAT tick in the cost heading and price bar". "Cost breakdown with category rows and ticks". "Soft Save design button and its states". "Second Save design and the save error message". "Keep these opens Keep your saves on the Design tab". "One feedback prompt on the design tab". "Feedback panel asks which part". "Loan calculator card in the redesigned cost section". "No extensions state". "Edit home with Undo". "Draggable phone sheet that re-frames the house". "Front-first camera". "New backdrop and lighting on every model view". "Design tab loading skeleton with sheen". "Model loading, failed and unsupported states". "Make the new configurator icons fill ~82% of the phone tiles". "Remove the Gabled roof option from the side extension".
- "Design" means three things here: product design, UI design, building architecture.

**Process**
- The issue lifecycle: frame, grill, plan, build, retro. Plus eng-tweak and design-tweak for small cards. One PR = one ticket. During a lane, write only to that lane's card. Ready for Build with an Owner set is intentional.
- Commits: "craft cleanup" appears constantly. "record the design system sync" too. Dependency bumps arrive in batches.
- Labs merges by rebase. A merge commit blocks the merge button.
- The pre-commit hook runs StandardRB, the specs for changed files, and Lookbook preview coverage. "Do NOT run the full test suite unnecessarily."
- Local dev: use `tenant.localhost:3000`. Another host name breaks Vite CORS and the v3 pages go blank.
- Lanes (one card, one PR each) run in parallel under a "mastermind". Lanes stall on background waits that never wake them.
- Gristle is the grumpy octopus code reviewer: "Impatient tentacle who reads your code like it personally wronged them". Stats: DEBUGGING 37, PATIENCE 1, CHAOS 18, WISDOM 20, SNARK 72. Findings table: `# | Severity | File:line | Issue | Fix | Rationale`. Ends with "Gristle says: <one grumpy-but-fair sentence>".
- A "bug" label needs proof: correct inputs shown to give a wrong output, with the exact cause.
- Banned words in our writing: runbook, load-bearing, "when it lands", "cut a PR", folklore idioms.

**Labs OS 3.1 (the previous version)**: Bricky the brick mascot, the Planning Oracle that always says no, the Anti-Persona Bin, the Feedback River, the PRD Generator where every value is TBD, the Ritual Scheduler, Costinator 96 (sometimes negative), Party Wall Sweeper. Callbacks are welcome; repeats are not.

-----

## The apps

Each app is one file (two for some) in `src/apps/`. Read `API.md` first.

### brickty, the terminal (`10_terminal.js`, id `terminal`, multi)
A real shell over `OS.fs`. Prompt `researcher@labs ~/labs (main) $` in theme colours, blinking block cursor, scrollback, selectable output. Input through an off-screen textarea that holds focus while the window is focused (paste and IME work). History (↑↓, persisted), Tab completion (commands and paths), Ctrl+C (abort, sets `io.aborted`), Ctrl+L, Ctrl+A/E/U/W. Chaining with `;` and `&&`, pipes into `grep`, `head`, `tail`, `wc -l`, `sort`, `uniq`, and `>` / `>>` redirection to files. `$HOME`, `$USER`, `$?`.
Opens with `arg = {run: 'line'}` (runs it) or `{cwd}`. Implements the `io` object in API.md for every registered command.
Core commands: help, ls (-l -a), cd, pwd, cat, head, tail, grep (-i -n -r), wc, echo, touch, mkdir (-p), rm (-r -f), mv, cp, tree, find -name, clear, history, whoami, id, uname -a, hostname, date, uptime, env, export, alias, which, man, sudo, exit, open, theme, wallpaper, lock, brickfetch (neofetch-style: an ASCII Bricky beside OS, Kernel, Uptime, Packages, Shell, WM, Theme, Terminal, CPU, GPU, Memory, Spend, and the colour blocks), fortune, brickysay, sl (a skip lorry drives across), matrix, git (status, log --oneline from `OS.data.commits`, branch, diff, blame, commit -m, checkout -b, push, push --force, rebase), bin/rspec_all and bundle exec rspec (dots, one flaky failure that passes on retry), bundle exec standardrb --fix, npm run check:ci, npm install, bin/dev (streams server logs until Ctrl+C), brick (the package manager: -Syu, -S, -Q, -R), clod (the AI coding CLI parody: streams "thinking", charges `OS.spend`, says it made the change, has not run it; `--dangerously-skip-permissions` is refused by Bricky), top/htop/btop (open lanetop), vim/nvim/vi/labvim <file> (open labvim with `{path}`), ssh, ping, curl/wget (offline, like a brick), make, python, rails console (an irb-ish prompt that raises `ActsAsTenant::Errors::NoTenantSet` until you set a tenant).
`rm -rf /` and friends: Bricky intervenes. `sudo`: "researcher is not in the sudoers file. This incident will be reported to Bricky."

### labvim (`20_labvim.js`, id `labvim`, multi)
A modal editor over `OS.fs`. Normal, insert and command-line modes. h j k l, w b, 0 $, gg G, x, dd, yy, p P, o O, i a I A, u and Ctrl+R, J, /search with n N, :w :q :wq :q! :e <path> :set number / relativenumber, :%s/a/b/g, :<line>. A statusline with mode, file, modified flag, filetype, line:col. Light syntax highlighting for rb, js, ts, md, yml. A start dashboard when opened with no file (block-letter LABVIM, "LazyLabs: 47 plugins loaded in 3 ms. 46 do nothing.", shortcuts: f find file, n new, r recent, q quit). Space f f opens a fuzzy file finder over `OS.fs.walk`. `:q` on a modified buffer gives the vim error plus Bricky. Pressing Esc five times in normal mode shows: "To exit, type :q and press Enter. Many have tried." `:Gristle` opens the Gristle app on the buffer.
Opens with `{path}`.

### Gristle (`21_gristle.js`, id `gristle`)
The octopus reviewer as an app. Left: the ASCII card and live stats (PATIENCE goes down by one per review; at 0 Gristle refuses until tomorrow, UTC; listen for `OS.on('spend')` after `OS.spend.tomorrow()`). Right: choose a target: "Labs OS itself" (the real bundled source of this page, from the inline script), a file from `OS.fs`, or pasted code. "Review" charges `OS.spend` and runs real static checks on the text: long lines, long functions, deep nesting, TODO/FIXME, console.log, exact duplicate lines, `==`, `var`, magic numbers, trailing whitespace, comments that restate the code, banned words in comments (load-bearing, runbook, simply, just). Every finding cites a real line number. Output is the findings table with stable ids (G-1...), severity, file:line, issue, fix, rationale, in Gristle's voice: grumpy, precise, helpful, never cruel to people. Close with "Gristle says: ...". "Apply the boring fixes" applies the safe ones (trailing whitespace) to `OS.fs` files and saves; for the page source it refuses (read-only) and says so.
Also registers the `gristle [path]` command, which prints the card and the table in the terminal.

### Composer (`30_composer.js`, id `composer`), the centrepiece
Composes a 3D house from a "listing" in 22 visible stages, and benchmarks it against gold.
- Layout: a pipeline graph (22 nodes in dependency columns, edges from `needs`, each node with page code, label, an approach picker, a status dot, time and cost), the 3D view (`OS.r3d`), a run log, and a side panel (house input: a gold house id or any invented address; Run; end-to-end or isolated; results).
- Determinism: the house is generated from `OS.hash` of the input, so the same input always composes the same house. Approaches change the result. The default approaches (`stage.def`) give the "main" result.
- The 3D model builds up as stages complete: house box (translucent), floor boxes per storey, massing (solid walls), roofer (gable, hip, chalet; ridge, hip and valley lines drawn as overlay lines), decorate (windows, door, downpipes from the main roof front gutter, chimney), wall materials (colour from the "library"), composed model (final, with neighbours from site context). A toggle shows the roof as a heightmap (black low, white high).
- Real bugs, reproduced by old approaches, so picking them shows the bug the fix fixed: an old floor_boxes or floor_outlines approach glues a neighbouring drawing onto the floor (an extra wing appears); old tag_images can pick the rear photo as the front (the door ends up at the back); old align_floors drops the upper storey; old mark_features leaves windows floating 0.3 m in front of the wall; old massing cuts the door 3 m wide; an unscaled plan tile makes the house enormous. The right approach fixes each one.
- Benchmark: each stage scores against gold (✓ or ✗). The headline is "✓ not worse than main" or "✗ worse than main (2 regressions)". The final composed model scores about 5/10 against the photos whatever you do.
- Spend: model stages (`llm: true`) charge `OS.spend`, about $1.50 to $3.00 per end-to-end run. A per-note cap of $10.00 refuses the next run with the real sentence. A "Write up" button concludes the note (positive, negative or inconclusive, usually inconclusive) and opens the follow-on note H-(n+1).
- "Demolish" plays the demolish flourish: faces fall and settle.
- Registers `bin/composer` (alias `composer`): `run <house> [--stages all] [APPROACH=stage:name]`, `stages` (table with page codes), `approaches <stage>`, `gold`.

### Configurator (`40_configurator.js`, id `configurator`)
The v3 configurator, after five design reviews, booked for a sixth. A 3D view (its own house builder on `OS.r3d`; it never shares Composer's, as in production) and a Design panel: This home card, Extension type tiles (Existing, Rear extension, Side extension, Side infill, Loft, Wraparound), Size (Small, Medium, Large, shown as `3 × 4.5m`: the width is always 3; a loft shows m²), Wall material, Roof material. A price bar with a tweened range, "See breakdown" (category rows with ticks, a VAT tick), "Save design" with soft states (Save design, Saving, Saved; a second save says so), Edit home with Undo, a Loan calculator card (real repayment maths, "Representative example. Not an offer."), one feedback prompt that asks which part. Front-first camera. A loading skeleton with sheen on open. The side extension has no Gabled roof option (it was removed).
Intentional jank: the configurator listens for `OS.on('design-review:apply', fixes)` and applies each fix literally (radius +2px, the price bar moves up 4px, "Save design" becomes "Keep design" and back, icons grow to ~82% of their tile). The round number shows in the title and persists.

### Design Review (`41_design_review.js`, id `design-review`)
"Design review, round N". A board with a miniature of the configurator and numbered comment pins from three roles that mean three different things by "design": product design, UI design, building architecture. They contradict each other and earlier rounds. "Apply all fixes" emits `design-review:apply` (the configurator changes), increments the round, and drafts the PR title "Configurator redesign fixes from the round N design review". Round 10 says to go back to round 1, and does.

### lanetop (`50_lanetop.js`, id `lanetop`)
A btop-style monitor of agent lanes, drawn with box-drawing characters. Panels: tokens-per-second graph, spend (the real `OS.spend`), context-window meters that fill and "compact", the lanes table (pid, lane, card, state: building, reviewing, waiting on CI, stalled on a background wait, done; tok/s, spent, age), and a dev-runner disk meter that climbs to its 80% and 90% alerts until you prune Docker images. Keys: ↑↓ select, k kill, n nudge a stalled lane, s spawn, p prune, q quit. Lanes move between states on their own.

### ultracode (`51_ultracode.js`, id `ultracode`)
Agentic Factory 2. Type what the agents should build, pick a workflow size ("medium: keep workflows under 10 agents"), run. A live graph of agents spawning agents (reviewers for the reviewers), with counters: agents, PRs opened, PRs approved, lines changed, features shipped (0), spend (real `OS.spend` charges). The guideline is shown and exceeded. It ends when you press Stop, or when the daily cap refuses the next charge, through `OS.crash` with the cap sentence. Final report: what shipped (a CHANGELOG listing the reviews).

### Planning Oracle 2 (`52_oracle.js`, id `oracle`)
3.1's Oracle, now with reasoning. Describe an extension (type, depth, height, eaves height, distance to boundary, detached or not) and pick an effort: low, medium, high, xhigh, max (cost rises with effort; max is the easy way to reach the daily cap). It streams visible "thinking" that genuinely checks the permitted-development Class A limits (rear depth 3 m, or 4 m detached; height 4 m single storey; eaves 3 m within 2 m of a boundary; half the curtilage; Article 4; conservation areas) and lists which pass and fail. Then the verdict is No. If everything passes: "Your proposal meets every Class A limit. The Oracle says no." Registers `oracle "<description>"`.

### Gold Labeller (`60_gold.js`, id `gold`)
Label houses for gold. A procedurally drawn house front (canvas, from a seed) and the gold questions one at a time: is this the front (sometimes it is the rear), storeys (ground = 0), wall finish, wall colour (swatches, or "Another colour" with an eyedropper that really samples the canvas), door colour, roof type, then "mark the facade": drag boxes round windows and doors on the canvas. A second labeller (a bot) answers too; agreement is computed; disagreements go to Resolution with the real rules. Saving to `/gold` fails with EPERM ("gold is never edited, only overridden"); it writes `~/gold-overrides/<id>.yml` instead. A queue from the "smoke" dev set, stats, held-out houses that refuse to open.

### Issue Lifecycle (`61_lifecycle.js`, id `lifecycle`)
A kanban board: Backlog, Frame, Grill, Plan, Ready for Build, In Build, In Review, Done. Drag cards between columns. Moving to Grill asks three of its forty questions. Moving to Plan splits the card into sub-issues. Linking a second PR to one card is refused (one PR, one ticket). Opening a sibling card while one is In Build is refused (stay on the card you were given). Done runs the retro, which files a process learning and moves the card back to Frame with a "re-frame" label. The board persists.
