# Hana Chat UI/UX Direction

Last updated: 2026-05-23

## 1. Design Goal

Hana Chat should feel premium, intimate, fast, and emotionally alive without becoming cluttered or gimmicky.

The visual direction:

> Pure black, modern, anime-waifu inspired, red-hot pink primary, shadcn-like clarity, simple enough to use for hours.

The app should not feel like a crypto dashboard, generic SaaS panel, or cheap adult chatbot clone. It should feel like a polished companion product with strong taste.

## 2. Brand Feel

### Keywords

- Intimate
- Soft
- Fast
- Romantic
- Playful
- Premium
- Private
- Character-led
- Memory-first

### Avoid

- Overly busy anime fan-site layouts.
- Gradients of any kind in product UI.
- Emoji or letter-based avatars/logos.
- Cheap neon overload.
- Giant marketing hero pages inside the app.
- Landing heroes that fill the entire first viewport without showing the next section.
- Complicated dashboards for normal users.
- NSFW-first visual language.
- Cards inside cards.
- Cartoonish buttons that make the product feel unserious.

## 3. Visual Identity

### Core Theme

Hana should use a pure black interface with red-hot pink as the main brand color. The pink should be sharp and memorable, but used with restraint so important actions pop.

Recommended palette:

```ts
export const colors = {
  background: "#000000",
  backgroundElevated: "#050505",
  surface: "#0A0A0C",
  surfaceSoft: "#151519",
  border: "#24242A",
  borderStrong: "#3A3037",

  text: "#FFFFFF",
  textMuted: "#B9B4BB",
  textSubtle: "#77717B",

  primary: "#FF1F6D",
  primaryHover: "#FF0F5F",
  primaryPressed: "#DF0B51",
  primarySoft: "#3A0718",

  danger: "#FF5C7A",
  warning: "#FFB84D",
  success: "#64E6A2",
} as const;
```

### Color Rules

- Hot pink is for primary CTAs, active states, unread indicators, premium highlights, and emotional accents.
- Secondary accents should be status-only and must not become a second theme.
- Backgrounds are pure black; elevation comes from borders and flat charcoal panels.
- Use borders and restrained elevation instead of decorative shadows.
- Do not use CSS gradients.

### Current Product Polish

- Landing/auth copy must stay consumer-facing and must not describe internal stack, abuse controls, or security mechanisms.
- The public landing hero should use the character art as a background treatment and leave the next section visible on desktop and mobile.
- App screens should feel like a product workspace, not a pitch deck: dense enough to use, clear enough to scan, and never filled with dead cards.
- Shared controls should have premium hover, focus, disabled, and pressed states while preserving black surfaces and hotpink primary actions.

## 4. Typography

The font should feel smooth, modern, and slightly soft.

Recommended stack:

```css
font-family: "Geist", "Inter", "Plus Jakarta Sans", "Noto Sans JP", system-ui, sans-serif;
```

### Type Scale

- App title: 28-34px, semibold.
- Page title: 22-28px, semibold.
- Section title: 15-17px, semibold.
- Body: 15-16px, regular.
- Chat message: 15.5-16.5px, regular.
- Metadata: 12-13px, medium.
- Buttons: 14-15px, semibold.

Rules:

- No negative letter spacing.
- Do not scale fonts with viewport width.
- Chat text must be comfortable for long reading sessions.
- Keep line height generous in chat, tighter in lists.

## 5. Shape and Layout

Use shadcn-inspired simplicity:

- 8px radius for cards and panels.
- 10-12px radius for message bubbles.
- 999px radius only for pills, avatars, switches, and segmented controls.
- Thin borders.
- Calm spacing.
- Clear hierarchy.

Spacing scale:

```ts
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;
```

## 6. Anime-Waifu Inspiration

The anime influence should come through character art, expressions, small details, and emotional UI moments, not through chaotic decoration.

Good:

- High-quality character avatars.
- Character expression states.
- Soft pink highlight strokes.
- Subtle sparkle glyphs in empty states.
- Manga-panel inspired character preview crops.
- Relationship/memory moments presented like keepsakes.

Avoid:

- Overloaded chibi stickers everywhere.
- Excessive animated backgrounds.
- Fan-service-first visual identity.
- Loud patterned backgrounds behind chat text.
- UI that hides usability behind style.

## 7. Core Navigation

### Mobile Tabs

Bottom navigation:

1. Chats
2. Discover
3. Create
4. Memories
5. Profile

Use lucide-style icons or equivalent:

- Chats: message circle
- Discover: compass/search
- Create: plus/sparkles
- Memories: heart/archive/bookmark
- Profile: user

The main user flow should be:

```text
Open app -> continue chat -> send message -> memory improves -> upgrade when limit/value appears
```

## 8. Key Screens

### Chats

Purpose: resume relationships quickly.

Layout:

- Search at top.
- Pinned active characters.
- Recent conversations list.
- Each row shows avatar, name, last message, memory/relationship hint, unread state.
- No giant hero.

Important detail:

- Show memory value subtly, e.g. "Remembers your Kyoto arc" or "Knows your coffee order."

### Discover

Purpose: find characters fast.

Layout:

- Search.
- Category chips.
- Featured carousel if needed, but keep it compact.
- Character grid/list.
- Filters:
  - romance,
  - fantasy,
  - anime,
  - comfort,
  - adventure,
  - creator picks,
  - mature if enabled.

Character cards:

- Avatar/art dominant.
- Name.
- Short hook.
- Tags.
- Rating badge.
- Creator badge if relevant.

### Chat

Purpose: emotionally immersive conversation.

Layout:

- Header:
  - back,
  - character avatar,
  - name/status,
  - more menu.
- Message list.
- Composer.
- Memory pulse indicator when a meaningful memory is saved.

Composer:

- Text input.
- Send icon button.
- Plus menu for image, memory, scene, regenerate.
- Keep controls compact.

Message bubbles:

- User bubble: pink-tinted dark surface.
- Character bubble: neutral elevated surface.
- System/memory notes: small, quiet, dismissible.

Do not show huge instructional text in the chat. Let the interface be obvious.

### Character Profile

Purpose: preview before chat.

Layout:

- Full-width character art crop.
- Name and creator.
- Tags and rating.
- Short description.
- Start chat button.
- Memory compatibility highlights.
- Report/block in overflow menu.

### Create Character

Purpose: make character creation powerful but not intimidating.

Use a segmented, progressive builder:

1. Identity
2. Look
3. Persona
4. Publish
5. Review

Controls:

- Text inputs for name, marketplace description, greeting, persona, and scenario.
- Body direction, visual style, mood, backdrop, and detail option cards/selects.
- Toggle for public/private.
- Rating selector.
- Example dialogue editor.
- Live marketplace preview panel using dedicated Hana-colored character fallback media until creator media is uploaded or generated.

### Memories

Purpose: make the moat visible and trustworthy.

Sections:

- About you.
- Relationship memories.
- Story moments.
- Preferences.
- Boundaries.

Each memory row:

- Text.
- Source hint.
- Last used date.
- Edit.
- Delete.
- Pin.

This screen should feel like a private journal, not a database table.

### Paywall

Purpose: sell value without feeling predatory.

Sell:

- More messages.
- Better memory.
- Deeper character continuity.
- Adult mode for eligible users.
- Private characters.

Do not lead with adult content. Lead with:

> Deeper memory. Longer stories. More time together.

### Settings

Important settings:

- Account.
- Subscription.
- Privacy.
- Memory controls.
- Content preferences.
- Adult mode.
- Blocked characters.
- Data export/delete.

Adult mode should require:

- Mature account rating.
- Age confirmation.
- Paid entitlement.
- Two-step enable flow.
- Clear content rules.

## 9. Components

### Button

Variants:

- Primary: hot pink fill.
- Secondary: elevated dark surface.
- Ghost: transparent.
- Danger: red.
- Premium: dark surface with gold/pink accent.

Button rules:

- Use icons for obvious actions like send, back, close, settings.
- Use text only when the command needs clarity.
- Minimum touch target: 44x44.
- Loading state required.
- Disabled state required.

### Card

Use cards for:

- character tiles,
- conversation rows,
- memory rows,
- pricing tiers,
- modals.

Do not nest cards.

### Switches

Use switches for:

- adult mode,
- memory enabled,
- private character,
- notifications.

Adult mode switch must not be a single accidental tap. Use a confirmation sheet.

### Segmented Controls

Use for:

- character creation steps,
- discovery filters,
- memory categories,
- SFW/mature visibility where allowed.

### Modals and Sheets

Mobile:

- Use bottom sheets for common actions.
- Use full-screen modal for character creation and memory editing.

Web:

- Use shadcn-style dialogs and drawers.

## 10. Motion

Motion should feel smooth and expensive.

Use:

- 150-220ms transitions.
- Spring easing for sheets.
- Soft message arrival animation.
- Typing indicator.
- Subtle memory-save pulse.
- Haptic feedback on send, favorite, memory saved, purchase success.

Avoid:

- Continuous distracting animation.
- Heavy background motion behind text.
- Slow transitions that block chat.

## 11. Empty States

Empty states should be character-led and visual.

Examples:

- No chats: show a tasteful character illustration and "Find someone to talk to."
- No memories: "Memories will appear as Hana learns what matters."
- No discover results: "No matches. Try a different mood."

Keep copy short.

## 12. Accessibility

- Text contrast must pass WCAG AA.
- Touch targets at least 44x44.
- Reduce motion setting respected.
- Dynamic type support on mobile.
- No critical state shown by color alone.
- Mature/adult controls must be clear and not hidden behind tiny text.

## 13. Design Tokens

Initial token shape:

```ts
export interface HanaTheme {
  color: typeof colors;
  radius: {
    sm: 6;
    md: 8;
    lg: 12;
    pill: 999;
  };
  space: typeof space;
  typography: {
    fontSans: string;
    bodySize: 16;
    chatSize: 16;
  };
  shadow: {
    soft: string;
    panel: string;
  };
}
```

## 14. CSS Variable Draft

Compatible with a shadcn-like token model:

```css
:root {
  --background: 260 22% 4%;
  --foreground: 290 36% 96%;

  --card: 255 23% 9%;
  --card-foreground: 290 36% 96%;

  --popover: 255 23% 9%;
  --popover-foreground: 290 36% 96%;

  --primary: 324 100% 65%;
  --primary-foreground: 0 0% 100%;

  --secondary: 255 21% 14%;
  --secondary-foreground: 290 36% 96%;

  --muted: 255 18% 16%;
  --muted-foreground: 275 12% 70%;

  --accent: 190 100% 70%;
  --accent-foreground: 255 24% 8%;

  --destructive: 349 100% 68%;
  --destructive-foreground: 0 0% 100%;

  --border: 260 18% 18%;
  --input: 260 18% 18%;
  --ring: 324 100% 65%;

  --radius: 0.5rem;
}
```

## 15. UX Principles

1. Chat is the product.
   - Reduce friction to resume a conversation.

2. Memory must be visible.
   - Users should feel the app remembers without feeling surveilled.

3. Premium should feel like depth, not punishment.
   - Limits can exist, but paid value should be obvious.

4. Adult mode must feel private.
   - No loud labels, no public embarrassment, no accidental exposure.

5. Creator tools should feel powerful later, simple first.
   - Let users create a good character without learning prompt engineering.

6. The interface should disappear during roleplay.
   - Controls are there when needed, quiet when not.

## 16. First Design Deliverables

Build these before full implementation:

- App shell mockup.
- Chat screen.
- Discover screen.
- Character profile.
- Character creation flow.
- Memory screen.
- Paywall.
- Settings and adult-mode flow.
- Design token package.
- Component primitives:
  - Button,
  - IconButton,
  - Input,
  - TextArea,
  - Card,
  - Sheet,
  - Dialog,
  - Switch,
  - SegmentedControl,
  - Avatar,
  - Badge,
  - MessageBubble,
  - CharacterCard,
  - MemoryRow.
