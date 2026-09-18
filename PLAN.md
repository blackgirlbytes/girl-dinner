# Girl Dinner Product and Build Plan

## Product summary

Girl Dinner helps one to eight people decide what to eat. It collects each person's preferences, dietary restrictions, budget, and location; finds viable nearby restaurants; and presents a swipeable shortlist. Jev evaluates the subjective fit of each option while application code enforces hard constraints and calculates the final group result.

If the group cannot agree on a restaurant, the app turns that outcome into its signature fallback: a personalized light plate to make at home.

## Product goals

- Make choosing food feel quick and playful rather than exhausting.
- Work equally well for one person, a couple, best friends, or a group of up to eight.
- Respect allergies, dietary restrictions, budgets, operating hours, and reasonable travel limits.
- Give every participant a meaningful voice in a group decision.
- Reach a clear recommendation without forcing agreement when there is no good restaurant match.
- Make the at-home Girl Dinner fallback feel like a successful outcome rather than an error.

## Core product principles

1. **Safety and eligibility are deterministic.** Code filters closed restaurants, unacceptable travel distances, budget violations, and options without sufficient dietary or allergen information.
2. **Jev handles subjective judgment.** Jev scores how well restaurants and menu options fit cravings, mood, variety, and the party's stated interests.
3. **People still make the final choice.** The swipe flow captures explicit reactions instead of treating the model's top score as an unquestionable answer.
4. **Group fairness matters.** A restaurant that one person strongly dislikes should not win solely because everyone else finds it acceptable.
5. **Uncertainty changes the experience.** A close result or low-confidence judgment triggers a useful follow-up, a final matchup, or the Girl Dinner fallback.

## Supported modes

### Solo

One person provides their preferences and location, then swipes through a personalized restaurant shortlist. The first strong match can end the session, or the user can keep browsing. If nothing appeals, the app recommends an at-home plate.

### Pair

Two people join the same session and swipe privately. This works for partners, friends, roommates, or any pair without assuming their relationship. A mutual like creates a match; competing favorites can enter a final head-to-head vote.

### Group

Three to eight people join using a link or room code. Everyone receives the same eligible candidates, ordered for their individual experience when useful. The app aggregates votes and Jev scores while protecting the least-satisfied participant.

## End-to-end user flow

### 1. Start a session

The host chooses the party size and either continues alone or creates an invite link or room code. A group lobby shows who has joined and who is ready.

### 2. Collect each person's criteria

Each participant can enter:

- Current cravings or cuisines
- Foods and cuisines they dislike
- Dietary preferences
- Allergies and strict dietary restrictions
- Budget or price range
- Desired meal type and dining mood
- Dine-in, takeout, or delivery preference
- Maximum travel time or distance
- Current location, a manually entered location, or no shared location

The app should make most fields optional while clearly distinguishing preferences from hard restrictions.

### 3. Establish the search area

For one person, search near that person's location. For a group, calculate a reasonable shared area using travel time and each participant's maximum travel preference. The app may offer the host a manually selected neighborhood when location sharing is unavailable or inappropriate.

### 4. Discover and filter restaurants

Fetch nearby restaurant candidates and relevant place details. Before Jev evaluates anything, application code removes restaurants that are:

- Closed at the intended meal time
- Outside the party's travel limits
- Outside a hard budget ceiling
- Incompatible with a required service mode
- Missing sufficient evidence for a strict dietary or allergy requirement

### 5. Evaluate candidates with Jev

Send structured participant and restaurant data to Jev. Ask many narrow questions in one request, such as:

- How well does this restaurant match a specific person's current cravings?
- How appealing is the menu variety for this person?
- How well does this restaurant match the group's desired dining mood?
- How likely is this option to satisfy the party rather than merely being tolerated?

Jev returns typed scores, probability distributions, and confidence values. Application code normalizes and combines those signals with deterministic facts such as travel time and price.

### 6. Build the swipe stack

Show approximately 8 to 12 strong candidates. Each card should contain:

- Restaurant name, cuisine, and photos
- Representative menu items
- Price level
- Opening status
- Distance or travel time
- Dietary compatibility indicators
- A short, evidence-based explanation of why it fits

Swipe actions:

- **Left:** pass
- **Right:** interested
- **Up or Love button:** strong preference
- **Tap:** open restaurant and menu details

### 7. Resolve the decision

For a solo user, a strong positive swipe can become the recommendation immediately or the user can finish the stack.

For groups, the app waits until everyone has voted or until an agreed session timer expires. It then resolves the outcome using:

- Hard eligibility rules
- Each person's swipe result
- Extra weight for Love votes
- Per-person Jev fit scores
- Overall Jev fit and confidence
- A fairness adjustment for the least-satisfied participant
- Travel-time and price penalties

If there is a clear consensus, show a match screen. If two candidates are effectively tied, show a final two-option matchup. If the result remains weak or disputed, activate the Girl Dinner fallback.

### 8. Present the result

The final restaurant screen should show:

- The selected restaurant and representative menu items
- Who liked or loved it, without exposing private passes unless the product later requires that behavior
- Average and maximum travel time
- Dietary compatibility
- Directions, website, reservation, ordering, or phone actions when available

## Decision engine

### Hard filters in code

The following should never depend solely on a model judgment:

- Allergy safety
- Explicit dietary exclusions
- Whether a restaurant is open
- Geographic distance and route duration
- Hard budget limits
- Party size limits
- Restaurant availability and service modes

When allergen information is incomplete, the app must label it as unknown rather than assume an item is safe.

### Jev scoring

Jev should receive a structured state similar to:

```json
{
  "party": {
    "meal": "dinner",
    "mood": "casual and comforting",
    "people": [
      {
        "id": "person_1",
        "cravings": ["spicy", "noodles"],
        "dislikes": ["heavy fried food"],
        "dietaryPreferences": ["vegetarian"],
        "budget": 2
      }
    ]
  },
  "restaurants": [
    {
      "id": "restaurant_123",
      "cuisines": ["Thai"],
      "priceLevel": 2,
      "travelMinutesByPerson": {"person_1": 12},
      "menuItems": [
        {
          "name": "Vegetable drunken noodles",
          "description": "Wide rice noodles with vegetables and chili",
          "dietaryTags": ["vegetarian", "spicy"]
        }
      ]
    }
  ]
}
```

Use Jev `Score` questions for graded preference fit, `Noul` questions for well-defined yes/no judgments, and `Choice` questions only when selecting among an explicit set is the result the code needs. Questions sharing the same state should be sent together.

An initial group score can use a formula such as:

```text
restaurant score =
  35% average participant preference fit
  25% least-satisfied participant fit
  15% swipe consensus
  10% menu variety
  10% travel fairness
   5% price fit
```

These weights are starting assumptions. They should be configurable and tuned using observed sessions rather than embedded permanently in prompts.

### Confidence and ties

- High confidence with strong swipe agreement: select the winner.
- Medium confidence or a close score: show a final matchup or ask one focused preference question.
- Low confidence: request missing information or use the Girl Dinner fallback.

Confidence thresholds should be tested with real examples before production use.

## Girl Dinner fallback

The fallback activates when:

- No restaurants survive the hard filters
- No candidate receives sufficient support
- Participants reject the entire stack
- A final vote remains tied
- Jev confidence remains low after a focused follow-up
- The session timer expires without a decision

The fallback builds a light plate from compatible components:

- Something savory
- Something crunchy
- Fruit or vegetables
- A protein or filling component
- A dip or spread
- A small treat
- An optional drink

Users may optionally identify ingredients they already have. The app then filters a curated ingredient and plate catalog using hard dietary rules, and Jev scores the remaining combinations for current cravings, effort, variety, and group appeal.

For one person, return a personalized plate. For a group, offer either a shared snack board or individual mini plates. The result should include ingredients, simple assembly instructions, estimated preparation time, and substitutions.

Example outcome:

> No restaurant match tonight. It's Girl Dinner time: hummus, warm pita, cucumbers, olives, grapes, and a little chocolate. Ready in about 8 minutes.

## External services and credentials

### Required for Jev

- A TypeSafe account
- `TYPESAFE_API_KEY`, stored only in a server-side environment variable
- The official TypeSafe JavaScript/TypeScript SDK or the HTTP API

The API key must never be exposed in browser code, committed to Git, or included in logs.

References:

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe quick start](https://docs.typesafe.ai/introduction/quickstart)
- [TypeSafe primitives](https://docs.typesafe.ai/primitives)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [TypeSafe JavaScript SDK](https://github.com/typesafe-ai/typesafe-sdk-js)

### Restaurant and location data

Recommended starting point:

- Browser geolocation for participant GPS, with explicit user permission
- Google Places API for restaurant discovery and place metadata
- Google Maps JavaScript API if the product displays an interactive map
- Google Routes API if accurate travel times are needed

Google services require a Cloud project, enabled APIs, billing, and restricted API keys. Browser and server credentials should be separated and restricted to their intended APIs and origins.

### Menu data

Google Places does not provide dependable, complete item-level menus. The MVP can use restaurant metadata, website or menu links, and controlled sample menu data while the decision workflow is validated.

Before a production launch, choose one or more of:

- A licensed structured menu provider
- Direct restaurant or ordering-platform integrations
- Restaurant-provided menu ingestion
- Carefully reviewed extraction from restaurant-owned menu pages where permitted

The source must provide enough provenance and freshness information to avoid presenting stale prices or unsafe dietary claims.

### Realtime rooms and persistence

Supabase is the selected production backend for separate-phone voting rooms. The Vercel project is connected to a Supabase Free project through the Vercel Marketplace.

- Postgres stores room participants, restaurant candidates, private votes, and the resolved result for six hours.
- Transactional database functions serialize joins and votes so simultaneous requests cannot overwrite each other.
- Supabase Realtime Broadcast tells connected phones when a room changes.
- Each broadcast prompts clients to fetch the trusted room snapshot from the Next.js API; clients never calculate or publish the group result.
- A low-frequency refresh protects the experience when a phone sleeps, changes networks, or misses a broadcast.
- Browser code receives only the Supabase publishable key. The Supabase secret key remains in Vercel's server-side environment.

## Privacy and safety

- Ask for location only when the participant chooses to share it.
- Allow manual neighborhood or address entry instead of GPS.
- Store precise participant locations only as long as necessary for the active session unless the user opts in to saving them.
- Keep individual votes private by default and reveal only the aggregate result.
- Separate allergies from preferences in both the interface and data model.
- Never describe uncertain allergen information as safe.
- Keep all private API keys on the server.

## MVP scope

The first useful version should include:

- Solo and group sessions for one to eight people
- Join by link or room code
- Preference, dietary, budget, and location intake
- Restaurant discovery from one provider
- Deterministic eligibility filtering
- Jev-backed preference scoring
- Tinder-style restaurant cards
- Pass, Interested, and Love reactions
- Group consensus and a final matchup
- Restaurant result screen
- Curated Girl Dinner fallback plates
- Basic session persistence and real-time group updates

The first version does not need restaurant reservations, ordering checkout, social profiles, historical recommendation learning, or nationwide structured menu coverage.

## Build phases

### Phase 1: Foundation

- Choose the web application stack and persistence layer.
- Define participant, session, preference, restaurant, menu item, vote, and result schemas.
- Add server-side environment validation.
- Integrate Jev behind a server-only service module.
- Create test fixtures for people, restaurants, menus, and expected outcomes.

### Phase 2: Solo decision loop

- Build preference and location intake.
- Add mocked restaurant discovery.
- Implement deterministic filters and Jev scoring.
- Build the swipe stack and solo result screen.
- Add the Girl Dinner fallback.

### Phase 3: Group sessions

- Add room creation and invitations.
- Support two to eight concurrent participants.
- Synchronize readiness and votes.
- Implement consensus, fairness, ties, and session timeouts.
- Add the group match screen.

### Phase 4: Live restaurant data

- Integrate Google Places and route calculations.
- Add field-level caching and cost controls.
- Add menu links and selected menu ingestion.
- Display data freshness and uncertainty where relevant.

### Phase 5: Validation and tuning

- Build a representative evaluation set for solo, pair, and group sessions.
- Test dietary filters separately from preference scoring.
- Compare outcomes with human selections.
- Tune score weights and confidence thresholds.
- Test the complete experience on mobile devices and unreliable networks.

## MVP acceptance criteria

- A user can start and finish a solo session without creating an account.
- A host can create a session containing up to eight participants.
- Every participant can independently submit preferences and votes.
- An ineligible restaurant cannot win because of a high Jev score.
- Eligible restaurants are presented in a swipeable stack.
- A clear group favorite produces a single final match.
- A close result produces a final matchup or focused follow-up.
- An unresolved session produces an appropriate Girl Dinner plate.
- Strict dietary requirements are visible throughout the result.
- TypeSafe and restaurant-provider credentials never reach the client bundle.

## Inputs needed before live integration

The application can be built with fixtures first. Live integration will require:

1. A decision about the initial menu-data strategy and launch geography.

The TypeSafe, Google Places, and Supabase credentials are already configured for local development. Supabase is also connected to the Vercel production, preview, and development environments.

Secrets should be placed in local or hosted environment configuration and never pasted into documentation or committed to the repository.
