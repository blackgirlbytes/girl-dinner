# How I prompted agents to build Girl Dinner

Girl Dinner helps one to eight people decide what to eat. You swipe through restaurants, vote, and get suggestions for a light plate at home if nobody agrees.

I used **Codex with GPT-5.6 Sol for the logic** and **Claude Code for the redesign**, because I prefer Claude for design work.

These are my actual prompts, including the follow-up questions and changes of direction. The prompt blocks preserve my wording; only transcript formatting and encoded spaces have been cleaned up. The explanations between them describe what happened and what you can take from it. Follow along in [Entire session 1](https://entire.io/sessions/aws-us-east-2/2286e7523bac0e5a6c54af4d3c2e9b85) and [Entire session 2](https://entire.io/sessions/aws-us-east-2/17ded876128e23a4adedfed05d9e83c0).

## 1. Set up a history you can learn from

My first prompt:

```text
lets create an AGENTS.md file that instructs the agent to make a commit every time a file is changed
```

Later, I tightened the rule:

```text
okay api key is in there..only thing i want you to do is add to the agents.md this rule..it already says always make a commit on every file change..but we need it to make a commit and push on every file change.
```

With Entire enabled, commits connect code changes to session checkpoints, and pushes sync that history. I wanted small, frequent checkpoints so I could revisit how the app came together. `AGENTS.md` sets the workflow; Entire records the context.

Committing every file change was my choice, not an Entire requirement. It creates more commits; another project might use one per coherent change. [Checkpoint capture](https://docs.entire.io/guides/checkpoints/capture-checkpoints)

## 2. Ask the agent to teach you before it builds

This was my product brief:

```text
okay great..lets take a look at the jev documentation ([https://docs.typesafe.ai/introduction](https://docs.typesafe.ai/introduction))..we're going to build with it..for context we're building girl-dinner. This application does the following:

it helps people from 1 person to a group of 8 decide on what they want to eat together. If it's one person..it just helps them decide what they should eat by themselves..if it's 2 people it could be best friends or a couple (like gf, bf) who want to know what type of food they should eat. then the more people you add (up to 8)..it includes them as well.

It should get criteria from people like what theyre interested in eating, dietary restrictions, people's locations..it can use like map location /gps , and find restaurants plus the menu in the area that will fit. Jev will be the one that helps make the decision based on its scoring.

But before we build this all out..let's figure out:

1. how to use jev (please share that info with me even though youre the one executing)
2. do you need anything from me..such as api key etc..or are you able to grab that on your own
```

The useful part of this prompt is asking the agent to explain the technology and its dependencies before implementation. I wanted to understand what I was building, even though the agent would write the code.

**Jev is an AI-powered multiple-choice machine.** Give it information and predefined questions, and it returns judgments your software can use:

- **Choice:** pick an option, such as one of three cuisines.
- **Score:** rate something on defined levels, such as poor through exceptional restaurant fit.
- **Noul:** estimate the probability a statement is true, such as whether a description suggests a quiet atmosphere.

For Girl Dinner, Google finds restaurant candidates and Jev scores their fit. Our code handles ranking and votes. **Jev provides the judgment; the code remains in charge.** [Jev’s question types](https://docs.typesafe.ai/primitives)

Choice and Score also return confidence, which describes how concentrated the judgment is. A confident answer can still be wrong. Noul returns a probability without a separate confidence field. [Confidence explained](https://docs.typesafe.ai/confidence)

## 3. Build the experience through follow-up prompts

I added the fallback:

```text
oh last requirement if no decision is made then we can decide that they need to eat a girl dinner..which could be just make a light plate at home..and give them suggestions for that.
```

Then the interaction:

```text
in the end would the users have multiple options maybe like tinder style that they can swipe through and then come to a final decision
```

Then asked the agent to preserve our decisions:

```text
lets make this into a plan file
```

I didn’t specify the whole app in one perfect prompt. Each follow-up added a product decision. Saving them in `PLAN.md` gave the build—and the next agent—a shared reference. [Planning checkpoint](https://github.com/blackgirlbytes/girl-dinner/commit/630140f)

## 4. Supply credentials, then let the agent implement

I asked where the TypeSafe key belonged:

```text
okay do we need to create a dotenv file for the api key..where do you want me to put the api key
```

And added Google Places:

```text
what would be the api key name for the google maps/places..can we add it to our env.local and ill add the value
```

The agent created placeholders in ignored `.env.local`, using `TYPESAFE_API_KEY` and `GOOGLE_MAPS_API_KEY`. I supplied the values; server endpoints kept the keys out of browser code.

Then:

```text
okay we have both the api keys added. i think you can start working on it
```

That short instruction worked because we had already established the plan. The agent built the first Next.js flow with Google Places discovery, Jev scoring, pass-the-phone voting, and the at-home fallback. It tested real API calls and exercised the browser flow.

One important limit: Google restaurant metadata wasn’t a verified menu feed. The app’s order ideas were representative suggestions, and a Jev score couldn’t establish allergy safety. The first version also used shared group preferences and one search location, rather than every individual profile envisioned in the plan. [Recommendation implementation](https://github.com/blackgirlbytes/girl-dinner/blob/75514edf035b0d420113d8035b146da582d46bad/app/api/recommendations/route.ts)

## 5. Challenge the implementation with a real situation

The first flow assumed people could pass around one phone. I asked:

```text
well what if people wanted to vote on separate phones..we should give the option for voting on one phone or on separate phones..one person might be at home..and another person at work..type of thing and they want to decide beforehand
```

When I learned the shared-room implementation kept its data in server memory, I pushed back:

```text
wait are there other options..i dont want to do the development version..i want this to be used in production
```

This changed the architecture. Rooms needed to survive restarts and work across deployed server instances.

I also asked:

```text
i dont want to use supabase..what about websockets? is that possible
```

That led to a useful explanation: **WebSockets carry updates; durable storage remembers the votes.** We explored Cloudflare Durable Objects, Redis, and Supabase. Supabase Realtime itself uses WebSockets, so these weren’t mutually exclusive choices. [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

## 6. Choose services around your constraints, then delegate setup

An existing subscription mattered to the decision:

```text
is vercel + supabase an additional cost..i already have a pro plan on vercel
```

After discussing costs and alternatives, I chose:

```text
lets do supabase
```

Vercel would host the app; Supabase would store rooms and votes and notify connected phones about updates. We used Supabase’s Free plan through Vercel Marketplace—a separate service from my Vercel Pro subscription.

Then I told the agent what tools it could use:

```text
also the vercel cli is installed so you should be able to handle most of the setup if not all
```

The agent handled provisioning, environment configuration, migrations, and deployment. That’s an important part of working with an agent: tell it about the access and tools it has so it can carry the work through setup and verification.

Testing the deployment exposed a realtime issue even though votes persisted. The agent moved notifications into the database transaction that updated the room. A successful build alone wouldn’t have caught that. [Broadcast fix](https://github.com/blackgirlbytes/girl-dinner/commit/53c6756)

## 7. Switch agents and give specific design feedback

I used Claude Code for the redesign because I preferred its design judgment. After it inspected the app and suggested directions, I said:

```text
I was thinking i dont like the neo brutalist style and yes about phone width and desktop width as an issue..it does need to make swipe card as the hero
```

That feedback identified both an aesthetic problem and the interaction that deserved emphasis. Claude moved to a phone-width layout, a prominent ivory swipe card on a deep-plum background, and three shorter setup steps. It reported preserving the API and voting logic. [Redesign checkpoint](https://github.com/blackgirlbytes/girl-dinner/commit/21f42d3)

The handoff also left a concrete verification gap: Claude checked the main screens but reported that it hadn’t exercised the live separate-phone lobby and waiting flow. That still needed checking after the redesign. The session history makes those limits visible alongside the successful changes.
