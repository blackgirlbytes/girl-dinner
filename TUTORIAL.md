# How I prompted agents to build Girl Dinner

Girl Dinner helps one to eight people decide what to eat. You enter preferences, swipe through restaurants, and vote. If nobody agrees, you get suggestions for a light plate at home.

I used **Codex with GPT-5.6 Sol for the application logic** and **Claude Code for the redesign**, because I prefer Claude's design judgment. That’s my preference for this project, not a universal model ranking.

Here’s how to try the same workflow. These are condensed, copyable versions of my prompts, with a few improvements from what we learned. You can explore the original conversations in [Entire session 1](https://entire.io/sessions/aws-us-east-2/2286e7523bac0e5a6c54af4d3c2e9b85) and [Entire session 2](https://entire.io/sessions/aws-us-east-2/17ded876128e23a4adedfed05d9e83c0).

## 1. Make the work traceable before you build

My first request was to create an `AGENTS.md` rule requiring a commit after every file change. I later added an immediate push.

```text
Create AGENTS.md. After every tracked file change, commit and push
that change before editing another file. Stage only your changes.
Never commit secrets or ignored files. If the push fails, stop and
explain the blocker.
```

With Entire enabled, commits connect code changes to checkpoints containing the agent’s session context, and pushes sync that history. I wanted frequent, small checkpoints so I could revisit the prompts and decisions behind the code. **AGENTS.md sets the workflow; Entire records it.**

One commit per file was my choice for this walkthrough, not an Entire requirement. It creates more commits, and intermediate commits may not build independently. For other projects, you might prefer one commit per coherent change. [How Entire captures checkpoints](https://docs.entire.io/guides/checkpoints/capture-checkpoints)

## 2. Ask the agent to explain unfamiliar technology

Before implementation, I asked it to read Jev’s documentation and explain what we could actually build.

```text
Read https://docs.typesafe.ai/introduction. We're building Girl Dinner
to help 1–8 people choose food based on cravings, dietary needs,
budget, and location. Explain how Jev fits, what it cannot do, and
which credentials or services we need before writing code.
```

**Jev, simply: an AI-powered multiple-choice machine.** You give it information and predefined questions. It returns typed judgments your software can use.

| Question type | Plain-English meaning | Dinner example |
| --- | --- | --- |
| Choice | Pick from supplied options | Which of these cuisines fits? |
| Score | Rate something on defined levels | How well does this restaurant fit, from poor to exceptional? |
| Noul | Estimate the probability a statement is true | Does this description suggest a quiet atmosphere? |

For Girl Dinner, we used **Score** questions. Google supplies restaurant information; Jev scores the fit; our code combines those scores with other signals and handles voting. Jev doesn’t search for restaurants or run the application. [Jev’s question types](https://docs.typesafe.ai/primitives)

Choice and Score also return confidence. Think “how concentrated is this judgment?” rather than “how likely is this guaranteed to be correct?” Noul returns a probability without a separate confidence field. [Confidence explained](https://docs.typesafe.ai/confidence)

General-purpose models can return structured outputs too. What interested me here was building around small, explicitly defined judgments.

## 3. Define the experience, including when nobody agrees

I added two requirements through follow-up prompts: Tinder-style swiping and an at-home fallback. Then I asked the agent to save our decisions.

```text
Let people swipe through several restaurant options. If nobody
agrees, suggest a simple Girl Dinner plate at home. Turn our
decisions into PLAN.md with the user flow, service responsibilities,
build phases, and acceptance criteria.
```

This gave the agent a concrete product to build and a plan another agent could read later. The fallback was part of the experience from the beginning: “no restaurant match” still needed to lead somewhere useful. [Original planning checkpoint](https://github.com/blackgirlbytes/girl-dinner/commit/630140f)

## 4. Connect real data and build a complete first flow

The services had separate jobs:

- **Browser location:** coordinates, with the user’s permission.
- **Google Places:** nearby restaurants and details such as ratings, prices, and addresses.
- **Jev:** subjective preference scoring.
- **Next.js:** the interface, server endpoints, and application rules.

```text
Create ignored .env.local placeholders for TYPESAFE_API_KEY and
GOOGLE_MAPS_API_KEY. I'll add the values. Keep both keys server-side.
Then build setup → restaurant shortlist → swiping → result or
at-home fallback. Label sample data clearly when live data is unavailable.
```

The first version let a group pass one phone around. The agent tested a real Google Places request and Jev scoring, then exercised the browser flow. Browser testing caught a useful bug: fallback ingredients weren’t adapting to dietary selections. The agent corrected it.

Be precise about what exists: this version collects shared group preferences and one search location, with individual votes. Separate preference profiles and location balancing were broader planning ideas.

Also, the displayed order ideas are representative suggestions, not verified restaurant menus. Don’t turn a preference score into a claim of allergy safety. [Implemented recommendation route](https://github.com/blackgirlbytes/girl-dinner/blob/75514edf035b0d420113d8035b146da582d46bad/app/api/recommendations/route.ts)

## 5. Use a real scenario to challenge the architecture

My next question was practical: what if one person is at home and another is at work?

```text
Support both passing one phone and voting on separate phones.
People should join with a link or room code. This must work when
deployed: rooms and votes need to survive server restarts, and
everyone should receive the same result.
```

That exposed the limits of the temporary in-memory room store. We discussed Supabase, Cloudflare Durable Objects, WebSockets, and Redis before I chose **Vercel + Supabase**.

I already had Vercel Pro. Vercel hosted the Next.js app; Supabase supplied persistent Postgres storage and realtime notifications. In our implementation, a room update tells connected phones to fetch the latest state.

The useful distinction: **WebSockets carry updates; durable storage remembers the votes.** Supabase Realtime uses WebSockets, so choosing Supabase didn’t mean giving those up. [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

We provisioned Supabase’s Free plan through Vercel Marketplace. It was a separate service, not a paid Supabase subscription included with my Vercel plan.

## 6. Delegate setup, deployment, and verification together

I explicitly told the agent that the Vercel CLI was installed and it could handle the setup.

```text
Use the installed Vercel CLI to link the project and provision
Supabase through Marketplace. Configure the environments, apply
the database migrations, and deploy. Use the Free plan we selected;
ask before anything requires a paid upgrade or account authorization.
Verify room creation, joining, simultaneous votes, and realtime
updates against the deployed app. Keep credentials out of logs and Git.
```

The agent handled provisioning, environment configuration, migrations, and deployment. I supplied the initial Google and TypeSafe keys.

Deployment testing mattered: votes persisted, but a realtime notification failed to arrive. The agent moved the notification into the database transaction that updates the room. That’s the kind of issue “the build passed” doesn’t establish. [Broadcast fix checkpoint](https://github.com/blackgirlbytes/girl-dinner/commit/53c6756)

## 7. Give the design handoff a clear boundary

Once the logic worked, I switched to Claude Code. I didn’t like the neo-brutalist styling, and the swipe card needed to be the focus.

```text
Read PLAN.md and inspect the running app at phone and desktop sizes.
Redesign it around the swipe card. Remove the neo-brutalist styling,
use a phone-width layout, and simplify setup into short steps.
Preserve the existing API calls, voting, and realtime behavior.
Verify the redesigned flows in the browser.
```

Claude produced a deep-plum background, warm ivory cards, simpler typography, and three setup steps. Giving it a concrete interaction to emphasize was more useful than asking it to “make it beautiful.” [Redesign checkpoint](https://github.com/blackgirlbytes/girl-dinner/commit/21f42d3)

One last prompt belongs after any handoff:

```text
Recheck the complete deployed journey after these changes, including
two separate browser sessions joining and voting in the same room.
Report what passed, what failed, and what you could not test.
```

Claude verified the main screens but reported that it hadn’t exercised the live separate-phone lobby and waiting flow. That distinction belongs in the handoff: earlier backend verification doesn’t replace checking the final interface.
