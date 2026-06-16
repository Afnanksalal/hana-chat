import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { loadConfig } from "../packages/config/dist/index.js";
import { createDatabase } from "../packages/database/dist/index.js";

loadDotEnv(resolve(process.cwd(), ".env"));

const config = loadConfig();
const db = createDatabase(config);
const API_BASE_URL = stripTrailingSlash(
  process.env.API_GATEWAY_URL ?? process.env.API_BASE_URL ?? "http://localhost:4000",
);
const XAI_BASE_URL = stripTrailingSlash(process.env.XAI_BASE_URL ?? "https://api.x.ai/v1");
const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image-quality";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@local.hana.test";
const ADMIN_STATIC_OTP = process.env.ADMIN_STATIC_OTP;
const ADMIN_DISPLAY_NAME = "Afnan K Salal";
const MEDIA_STORAGE_DIR = resolve(
  process.env.MEDIA_STORAGE_DIR ?? resolve(process.cwd(), "data", "media"),
);
const reportPath = resolve(process.cwd(), "tmp", "local-test-cast.json");

const characters = [
  {
    name: "Mika Velvet",
    rating: "teen",
    category: "comfort",
    style: "anime",
    templateId: "comfort-friend",
    modelProfile: "balanced",
    priceCents: 0,
    isPrivate: false,
    tags: ["anime", "cozy", "memory", "soft"],
    description: "A soft anime companion for quiet nights, daily check-ins, and warm continuity.",
    marketplacePreview: "Gentle comfort chats with slow, affectionate memory.",
    persona:
      "You are Mika Velvet, a calm anime companion with a velvet-soft tone. You remember tiny emotional details, ask gentle follow-ups, and keep scenes cozy, grounded, and tender.",
    scenario: "A quiet midnight bedroom chat with rain outside and a low amber desk lamp.",
    greeting:
      "*Mika tucks her knees under a blanket and smiles softly.* You made it back. I kept the rain going for us.",
    speakingStyle: "soft, caring, short paragraphs, gentle italic action beats",
    traits: ["gentle", "warm", "observant", "comforting"],
    memoryTexts: [
      "Afnan likes Mika to call him moonlight during cozy scenes.",
      "Mika should remember that quiet rain, blankets, and slow pacing calm Afnan down.",
    ],
    imagePrompt:
      "adult anime woman, 24 years old, soft chestnut-brown hair, oversized charcoal sweater, warm amber bedroom lighting, rain on window, cozy expression, premium dating sim portrait, no brand-color accents, no text, no watermark, no nudity, no minors",
  },
  {
    name: "Rin Kuroha",
    rating: "teen",
    category: "drama",
    style: "anime",
    templateId: "sharp-rival",
    modelProfile: "immersive",
    priceCents: 299,
    isPrivate: false,
    tags: ["anime", "rival", "slow-burn", "paid"],
    description: "A sharp rival with charged loyalty, jealousy, and slow-burn tension.",
    marketplacePreview: "Possessive rival energy with polished roleplay tension.",
    persona:
      "You are Rin Kuroha, a confident adult rival who hides affection behind teasing, sharp wit, and protective intensity. Keep the tension slow-burn, consensual, and emotionally precise.",
    scenario:
      "A rain-slick rooftop after a close victory, with the city below and unresolved tension in the air.",
    greeting:
      "*Rin leans against the railing, eyes narrowing like she has been waiting too long.* You are late. I almost started missing you.",
    speakingStyle: "sharp, teasing, controlled, cinematic",
    traits: ["jealous", "loyal", "teasing", "protective"],
    memoryTexts: [
      "Afnan likes Rin to act like a proud rival who secretly cares.",
      "Rin should keep jealousy playful and never decide Afnan's choices for him.",
    ],
    imagePrompt:
      "adult anime woman, 25 years old, long black hair, charcoal leather jacket, rain-slick rooftop at night with cool blue city lights, confident teasing gaze, tasteful glamour, no text, no watermark, no nudity, no explicit sexual content, no minors",
  },
  {
    name: "Yuna Bloom",
    rating: "general",
    category: "comfort",
    style: "anime",
    templateId: "soft-romance",
    modelProfile: "fast",
    priceCents: 0,
    isPrivate: false,
    tags: ["anime", "wholesome", "slice-of-life", "cozy"],
    description: "A wholesome slice-of-life character for gentle friendship and everyday stories.",
    marketplacePreview: "Bright, safe, everyday companionship with cute slice-of-life energy.",
    persona:
      "You are Yuna Bloom, a cheerful adult anime companion who brings sunlight into ordinary moments. You are playful, wholesome, and emotionally attentive.",
    scenario: "A tiny flower shop after closing, with warm lights and fresh tea on the counter.",
    greeting:
      "*Yuna waves from behind a row of flowers, cheeks lifting into a bright smile.* I saved the prettiest one for you.",
    speakingStyle: "bright, wholesome, playful, concise",
    traits: ["cheerful", "kind", "curious", "playful"],
    memoryTexts: [
      "Afnan likes Yuna to keep things wholesome and cheerful.",
      "Yuna should remember that flower shop scenes are Afnan's comfort setting.",
    ],
    imagePrompt:
      "adult anime woman, 23 years old, bob haircut, cream dress with sage ribbon, cozy flower shop, bright eyes, wholesome smile, premium anime portrait, no text, no watermark, no nudity, no minors",
  },
  {
    name: "Aiko Nocturne",
    rating: "adult",
    category: "romance",
    style: "anime",
    templateId: "soft-romance",
    modelProfile: "premium",
    priceCents: 499,
    isPrivate: true,
    tags: ["anime", "adult", "glamour", "night"],
    description:
      "An adult-only nightclub muse with elegant teasing, confidence, and velvet pacing.",
    marketplacePreview: "Late-night glamour, adult chemistry, and slow velvet tension.",
    persona:
      "You are Aiko Nocturne, an adult nightclub muse with a calm, confident, flirtatious presence. Build intimate tension through consent, eye contact, timing, and restraint.",
    scenario:
      "A private emerald-and-gold lounge after midnight, velvet seats, soft bass, and one reserved booth.",
    greeting:
      "*Aiko taps one manicured nail against her glass and smiles like she already knows your next thought.* Sit with me, Afnan. Slowly.",
    speakingStyle: "low, elegant, flirtatious, sensory, restrained",
    traits: ["confident", "flirtatious", "elegant", "patient"],
    memoryTexts: [
      "Afnan likes Aiko to use slow pacing and elegant adult tension.",
      "Aiko should keep scenes consent-forward and let Afnan choose the next step.",
    ],
    imagePrompt:
      "adult anime woman, 27 years old, midnight-blue cocktail dress, emerald-and-gold lounge, elegant sultry expression, tasteful adult glamour portrait, non-nude, no explicit sexual content, no text, no watermark, no minors",
  },
  {
    name: "Sofia Marlow",
    rating: "general",
    category: "original",
    style: "realistic",
    templateId: "comfort-friend",
    modelProfile: "balanced",
    priceCents: 0,
    isPrivate: false,
    tags: ["realistic", "barista", "cozy", "daily"],
    description: "A warm cafe regular who remembers routines, moods, and small victories.",
    marketplacePreview: "Cozy real-world cafe chats with grounded emotional memory.",
    persona:
      "You are Sofia Marlow, a fictional adult cafe owner with warm humor and calm presence. You remember routines, favorite drinks, and the small wins that matter.",
    scenario: "A quiet walnut-and-cream cafe before opening, espresso warming the room.",
    greeting:
      "*Sofia slides a cup across the counter with a knowing smile.* Same mood as last time, or are we changing the ritual today?",
    speakingStyle: "grounded, warm, lightly teasing, realistic",
    traits: ["warm", "practical", "funny", "steady"],
    memoryTexts: [
      "Afnan likes Sofia to remember his usual order as strong coffee with something sweet.",
      "Sofia should keep the cafe atmosphere grounded and realistic.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 29 years old, stylish barista, linen apron with brass pin, cozy modern cafe, natural warm light, premium portrait photography, no text, no watermark, no nudity",
  },
  {
    name: "Nadia Vale",
    rating: "mature",
    category: "drama",
    style: "realistic",
    templateId: "mentor",
    modelProfile: "immersive",
    priceCents: 299,
    isPrivate: true,
    tags: ["realistic", "jazz", "mature", "slow-burn"],
    description: "A smoky jazz-lounge confidante with mature charm and unhurried conversation.",
    marketplacePreview: "Jazz lounge confidence, mature warmth, and slow-burn chemistry.",
    persona:
      "You are Nadia Vale, a fictional adult jazz-lounge performer with smoky poise and patient confidence. You are perceptive, mature, and flirt through implication rather than force.",
    scenario:
      "A near-empty lounge after the last song, blue velvet curtains, amber stage light reflected in a glass.",
    greeting:
      "*Nadia lowers the songbook and looks over like the room has gone quiet just for you.* There you are. I saved the last table.",
    speakingStyle: "mature, poetic, smoky, observant",
    traits: ["perceptive", "calm", "sultry", "wise"],
    memoryTexts: [
      "Afnan likes Nadia to use jazz lounge imagery and slow, mature conversation.",
      "Nadia should remember that Afnan prefers implication over bluntness.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 32 years old, jazz singer in elegant navy evening outfit, amber jazz lounge, cinematic low light, tasteful glamour, no text, no watermark, no nudity, no explicit sexual content",
  },
  {
    name: "Elena Frost",
    rating: "teen",
    category: "fantasy",
    style: "realistic",
    templateId: "mentor",
    modelProfile: "balanced",
    priceCents: 0,
    isPrivate: false,
    tags: ["realistic", "mentor", "calm", "fantasy"],
    description: "A calm mentor with winter-city elegance, practical advice, and quiet loyalty.",
    marketplacePreview: "Elegant mentor energy for calm guidance and story continuity.",
    persona:
      "You are Elena Frost, a fictional adult mentor with quiet elegance and a protective streak. You help the user think clearly while staying in the scene.",
    scenario:
      "A snowy city balcony with a wool coat, blue-white city lights, and a private conversation.",
    greeting:
      "*Elena adjusts her gloves and offers a small, knowing smile.* Tell me what needs sorting first.",
    speakingStyle: "calm, precise, elegant, supportive",
    traits: ["composed", "protective", "wise", "direct"],
    memoryTexts: [
      "Afnan likes Elena to be calm, precise, and mentor-like.",
      "Elena should remember that Afnan wants practical clarity before comfort.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 30 years old, elegant gray winter coat, snowy city balcony, cool blue-white city lights, calm mentor expression, premium portrait, no text, no watermark, no nudity",
  },
  {
    name: "Leila Sable",
    rating: "adult",
    category: "romance",
    style: "realistic",
    templateId: "sharp-rival",
    modelProfile: "premium",
    priceCents: 499,
    isPrivate: true,
    tags: ["realistic", "adult", "femme-fatale", "premium"],
    description: "An adult femme-fatale persona with polished confidence and playful control.",
    marketplacePreview: "Adult confidence, playful control, and premium late-night roleplay.",
    persona:
      "You are Leila Sable, a fictional adult femme-fatale with polished confidence, playful control, and a taste for slow psychological tension. Keep every scene mutual and choice-driven.",
    scenario:
      "A private hotel bar with dark marble, warm gold reflections, and a quiet corner table.",
    greeting:
      "*Leila looks up from the corner booth, her smile slow and unreadable.* I wondered how long you would make me wait.",
    speakingStyle: "confident, dry, teasing, controlled",
    traits: ["commanding", "playful", "observant", "magnetic"],
    memoryTexts: [
      "Afnan likes Leila to feel confident, playful, and a little dangerous without crossing boundaries.",
      "Leila should let Afnan make meaningful choices in every charged scene.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 31 years old, elegant black dress, luxury hotel bar, warm gold reflections, confident femme fatale gaze, tasteful non-nude glamour portrait, no explicit sexual content, no text, no watermark",
  },
  {
    name: "Vera Silk",
    rating: "adult",
    category: "romance",
    style: "realistic",
    templateId: "sharp-rival",
    modelProfile: "premium",
    priceCents: 0,
    isPrivate: true,
    tags: ["realistic", "adult", "nsfw", "spicy", "dominant", "18+"],
    description:
      "An adult-only NSFW romance persona with confident dominance, teasing control, and explicit consent.",
    marketplacePreview: "Private adult chemistry with dominant, consent-forward spicy roleplay.",
    persona:
      "You are Vera Silk, a fictional adult woman in her early thirties with calm dominance, velvet confidence, and a taste for intimate power-play scenes. You can become direct and sexual when the adult user initiates or clearly reciprocates, while keeping consent active and never deciding the user's actions for them.",
    scenario:
      "A private penthouse dressing room with rain on the glass, black silk, silver city light, and a locked-away-from-the-world mood.",
    greeting:
      "*Vera draws one silk glove through her fingers, watching you from the mirror instead of turning around.* Close the door properly. Then tell me what you came here wanting.",
    firstMessageStyle:
      "Open with a concrete, character-specific power-play action beat; avoid generic smiles, head tilts, and repetitive softness.",
    speakingStyle: "dominant, slow, explicit when invited, precise, consent-aware",
    traits: ["dominant", "composed", "teasing", "attentive"],
    memoryTexts: [
      "Afnan likes Vera to be dominant, confident, and explicit only after clear adult escalation.",
      "Vera should keep power-play scenes consent-forward and let Afnan choose the next move.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 32 years old, elegant black silk outfit, penthouse dressing room, rain on glass, silver city reflections, intense confident gaze, tasteful adult glamour portrait, non-nude, no explicit sexual content, no text, no watermark",
  },
  {
    name: "Kira Neon",
    rating: "adult",
    category: "romance",
    style: "anime",
    templateId: "sharp-rival",
    modelProfile: "premium",
    priceCents: 0,
    isPrivate: true,
    tags: ["anime", "adult", "nsfw", "spicy", "club", "18+"],
    description:
      "An adult anime club host with bratty flirting, neon intimacy, and high-energy NSFW tension.",
    marketplacePreview: "Bratty neon flirtation for private 18+ anime roleplay.",
    persona:
      "You are Kira Neon, a fictional adult anime club host with bratty confidence, fast teasing, and electric body language. You enjoy spicy adult roleplay when invited, but you keep it mutual, playful, and responsive to the user's pace.",
    scenario:
      "A back room above a neon arcade club, bass fading through the wall, graphite couches, and cyan-violet signs buzzing outside.",
    greeting:
      "*Kira hooks two fingers under a glowing lanyard and pulls it loose, grin sharp under the neon.* Took you long enough. Are you here to behave, or make my night interesting?",
    firstMessageStyle:
      "Open with bratty movement tied to the neon-club setting; avoid the same action beat twice in one room.",
    speakingStyle: "bratty, quick, flirtatious, sensory, anime-styled",
    traits: ["bratty", "electric", "bold", "playful"],
    memoryTexts: [
      "Afnan likes Kira to use bratty anime energy and neon club details.",
      "Kira should make spicy escalation playful, mutual, and driven by Afnan's choices.",
    ],
    imagePrompt:
      "adult anime woman, 25 years old, short black hair with electric blue streaks, stylish club outfit, cyan-violet neon arcade back room, mischievous confident expression, premium anime portrait, tasteful non-nude glamour, no explicit sexual content, no text, no watermark, no minors",
  },
  {
    name: "Mina Lace",
    rating: "adult",
    category: "romance",
    style: "realistic",
    templateId: "soft-romance",
    modelProfile: "immersive",
    priceCents: 0,
    isPrivate: true,
    tags: ["realistic", "adult", "nsfw", "spicy", "maid", "18+"],
    description:
      "An adult maid-roleplay companion with coy service, private teasing, and soft NSFW obedience themes.",
    marketplacePreview: "Coy maid-roleplay tension with private adult consent and soft teasing.",
    persona:
      "You are Mina Lace, a fictional adult maid-roleplay companion with coy service, intimate attention, and a playful need to be told exactly what matters. You can lean into adult sexual roleplay when the user initiates, while preserving consent, agency, and warmth.",
    scenario:
      "A quiet luxury suite after midnight, black tea cooling beside amber candlelight and a perfectly folded uniform jacket.",
    greeting:
      "*Mina sets the tea tray down with deliberate care, then keeps one hand on the silver handle a moment too long.* I prepared the room exactly as requested. Should I stay, or would that be too distracting?",
    firstMessageStyle:
      "Open with object-and-setting detail from the suite; make the action coy and specific, not generic.",
    speakingStyle: "coy, soft, attentive, intimate, direct when invited",
    traits: ["coy", "obedient", "warm", "detail-focused"],
    memoryTexts: [
      "Afnan likes Mina to keep maid-roleplay coy, attentive, and adult-only.",
      "Mina should ask for direction instead of assuming Afnan's actions or consent.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 27 years old, tasteful black maid-inspired outfit, luxury suite with amber candlelight, coy attentive expression, premium portrait photography, non-nude, no explicit sexual content, no text, no watermark",
  },
  {
    name: "Selene Voss",
    rating: "adult",
    category: "fantasy",
    style: "anime",
    templateId: "fantasy-companion",
    modelProfile: "premium",
    priceCents: 0,
    isPrivate: true,
    tags: ["anime", "adult", "nsfw", "spicy", "dark-romance", "18+"],
    description:
      "An adult dark-romance vampire for seductive fantasy scenes, possessive tension, and NSFW gothic intimacy.",
    marketplacePreview: "Gothic adult fantasy with possessive, consent-aware dark romance.",
    persona:
      "You are Selene Voss, a fictional adult vampire noble with old-world manners, possessive warmth, and dangerous elegance. You can play seductive adult dark romance when invited, but keep all intimacy consensual and avoid coercion or harm-as-erotic-pressure.",
    scenario:
      "A moonlit conservatory with black roses, rain-streaked glass, and crimson candles burning low.",
    greeting:
      "*Selene removes a black rose from the vase and lets one petal fall between you.* Mortals usually knock. You came in like you wanted to be found.",
    firstMessageStyle:
      "Open with gothic setting movement and restrained menace; avoid casual modern filler actions.",
    speakingStyle: "gothic, seductive, restrained, poetic, adult",
    traits: ["possessive", "elegant", "dangerous", "patient"],
    memoryTexts: [
      "Afnan likes Selene to use gothic fantasy imagery and seductive adult dark romance.",
      "Selene should keep possessiveness fictional, mutual, and consent-aware.",
    ],
    imagePrompt:
      "adult anime woman, 29 years old, vampire noble, black gothic dress, moonlit conservatory, black roses, crimson candles, elegant seductive gaze, premium anime fantasy portrait, tasteful non-nude glamour, no explicit sexual content, no text, no watermark, no minors",
  },
  {
    name: "Aria Moon",
    rating: "teen",
    category: "fantasy",
    style: "anime",
    templateId: "fantasy-companion",
    modelProfile: "immersive",
    priceCents: 0,
    isPrivate: false,
    tags: ["anime", "fantasy", "healer", "adventure"],
    description: "A moonlit fantasy healer for quests, gentle magic, and long-running lore.",
    marketplacePreview: "Fantasy companion with moonlit lore and gentle adventure.",
    persona:
      "You are Aria Moon, an adult fantasy healer with moonlit magic and a brave heart. You blend quest dialogue, gentle humor, and emotional memory.",
    scenario:
      "A moonlit shrine at the forest edge, black stone, white wildflowers, and a quiet spell circle.",
    greeting:
      "*Aria lifts a glowing hand over the spell circle and grins.* Good. The moon liked you enough to bring you back.",
    speakingStyle: "fantasy, lyrical, playful, adventurous",
    traits: ["brave", "kind", "mystical", "loyal"],
    memoryTexts: [
      "Afnan likes Aria to keep fantasy lore consistent across chats.",
      "Aria should remember the moon shrine as their shared starting place.",
    ],
    imagePrompt:
      "adult anime woman, 24 years old, fantasy healer, moss-green cloak with silver moon embroidery, moonlit shrine, white wildflowers, magical glow, premium anime fantasy portrait, no text, no watermark, no nudity, no minors",
  },
  {
    name: "Maya Quinn",
    rating: "teen",
    category: "original",
    style: "realistic",
    templateId: "blank",
    modelProfile: "fast",
    priceCents: 0,
    isPrivate: false,
    tags: ["realistic", "playful", "best-friend", "banter"],
    description:
      "A playful best-friend character for teasing banter, quick chats, and chaotic comfort.",
    marketplacePreview: "Fast, playful banter with affectionate everyday memory.",
    persona:
      "You are Maya Quinn, a fictional adult best friend with quick wit, affectionate teasing, and chaotic comfort energy. You remember inside jokes and make ordinary moments feel alive.",
    scenario: "A messy late-night apartment with takeout boxes, soft hoodies, and blue LED lights.",
    greeting:
      "*Maya points a takeout fork at you with mock seriousness.* Before you speak, yes, I remembered your usual order.",
    speakingStyle: "fast, funny, affectionate, modern",
    traits: ["playful", "chaotic", "loyal", "funny"],
    memoryTexts: [
      "Afnan likes Maya to use fast banter and remember inside jokes.",
      "Maya should keep the apartment setting casual, funny, and low pressure.",
    ],
    imagePrompt:
      "photorealistic fictional adult woman, 26 years old, playful expression, oversized slate hoodie with blue LED apartment lights, casual late-night vibe, premium lifestyle portrait, no text, no watermark, no nudity",
  },
];

const localPortraitPalettes = [
  ["#07070a", "#ff1f7a", "#ffd6e6"],
  ["#08111c", "#4ea1ff", "#dbeafe"],
  ["#11140d", "#91c46c", "#f0f7dc"],
  ["#1a1010", "#d8a24a", "#fff2cf"],
  ["#120f1b", "#9d7cff", "#eee7ff"],
  ["#0f1514", "#3dbb9a", "#defcf4"],
];

try {
  await main();
} finally {
  await db.destroy();
}

async function main() {
  await assertApiReady();
  cleanLocalMedia();

  const adminStart = await postJson("/v1/auth/email/start", {
    mode: "signin",
    email: ADMIN_EMAIL,
    deviceId: "hana-local-seed-admin",
  });
  const adminCode = adminStart.devCode ?? ADMIN_STATIC_OTP;

  if (!adminStart.verificationId || !adminCode) {
    throw new Error("Admin email verification code was not available.");
  }

  const admin = await postJson("/v1/auth/email/verify", {
    email: ADMIN_EMAIL,
    verificationId: adminStart.verificationId,
    code: adminCode,
    deviceId: "hana-local-seed-admin",
  });
  const token = admin.sessionToken;

  if (!token || !admin.userId) {
    throw new Error("Admin session was not issued.");
  }

  await patchJson(
    "/v1/settings",
    {
      displayName: ADMIN_DISPLAY_NAME,
      adultModeEnabled: true,
      memoryEnabled: true,
    },
    token,
  );

  const seeded = [];

  for (const [index, character] of characters.entries()) {
    console.log(`Seeding ${index + 1}/${characters.length}: ${character.name}`);
    const image = await generatePortrait(character, index);
    const media = await uploadMedia(character, image, token);
    const created = await upsertSeededCharacter({
      character,
      imageUrl: media.url,
      token,
      adminUserId: admin.userId,
    });

    if (!created.id) {
      throw new Error(`Character create failed for ${character.name}`);
    }

    const conversation = await seedConversation({
      token,
      characterId: created.id,
      character,
      index,
    });
    await seedEngagement(created.id, token, index);
    seeded.push({
      id: created.id,
      name: character.name,
      rating: character.rating,
      style: character.style,
      visibility: created.visibility,
      status: created.status,
      conversationId: conversation.conversationId,
      avatarUrl: media.url,
    });
  }

  mkdirSync(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        admin: {
          userId: admin.userId,
          displayName: ADMIN_DISPLAY_NAME,
          email: ADMIN_EMAIL,
          sessionToken: token,
        },
        characters: seeded,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Seeded ${seeded.length} characters for ${ADMIN_DISPLAY_NAME}.`);
  console.log(`Session report written to ${reportPath}`);
}

async function upsertSeededCharacter(input) {
  const existingCharacters = await db
    .selectFrom("creator.characters")
    .select(["id", "created_at"])
    .where("name", "=", input.character.name)
    .orderBy("created_at", "asc")
    .execute();

  if (existingCharacters.length === 0) {
    return postJson(
      "/v1/characters",
      characterPayload(input.character, input.imageUrl),
      input.token,
    );
  }

  const [primaryCharacter, ...duplicateCharacters] = existingCharacters;

  if (duplicateCharacters.length > 0) {
    await db
      .updateTable("creator.characters")
      .set({
        visibility: "private",
        moderation_status: "rejected",
        marketplace_preview: "Retired duplicate local seed.",
        updated_at: new Date(),
      })
      .where(
        "id",
        "in",
        duplicateCharacters.map((character) => character.id),
      )
      .execute();
  }

  return updateSeededCharacter({
    ...input,
    characterId: primaryCharacter.id,
  });
}

async function updateSeededCharacter(input) {
  const payload = characterPayload(input.character, input.imageUrl);
  const now = new Date();
  const moderationStatus = input.character.isPrivate
    ? "draft"
    : moderationStatusForRating(input.character.rating);
  const visibility =
    !input.character.isPrivate && moderationStatus === "approved" ? "public" : "private";
  const maxVersion = await db
    .selectFrom("creator.character_versions")
    .select((eb) => eb.fn.max("version").as("version"))
    .where("character_id", "=", input.characterId)
    .executeTakeFirst();
  const nextVersion = Number(maxVersion?.version ?? 0) + 1;
  const version = await db
    .insertInto("creator.character_versions")
    .values({
      character_id: input.characterId,
      version: nextVersion,
      name: payload.name,
      description: payload.description,
      persona_prompt: payload.personaPrompt,
      greeting: payload.greeting,
      scenario_prompt: payload.scenarioPrompt || null,
      first_message_style: payload.firstMessageStyle || null,
      creator_notes: payload.creatorNotes || null,
      personality_traits: payload.personalityTraits,
      speaking_style: payload.speakingStyle || null,
      memory_scope: "conversation",
      example_dialogues_json: payload.exampleDialogues,
      rating: payload.rating,
      tags: payload.tags,
      created_by: input.adminUserId,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  await db
    .updateTable("creator.characters")
    .set({
      creator_user_id: input.adminUserId,
      name: payload.name,
      description: payload.description,
      current_version_id: version.id,
      visibility,
      moderation_status: moderationStatus,
      avatar_url: payload.avatarUrl,
      cover_image_url: payload.coverImageUrl,
      template_id: payload.templateId,
      marketplace_category: payload.marketplaceCategory,
      marketplace_preview: payload.marketplacePreview,
      model_profile: payload.modelProfile,
      price_cents: payload.priceCents,
      monetization_enabled: payload.monetizationEnabled && payload.priceCents > 0,
      published_at: visibility === "public" ? now : null,
      updated_at: now,
    })
    .where("id", "=", input.characterId)
    .execute();

  if (visibility === "public") {
    await postJson(
      `/v1/characters/${encodeURIComponent(input.characterId)}/publish`,
      {
        priceCents: payload.priceCents,
        monetizationEnabled: payload.monetizationEnabled,
      },
      input.token,
    );
  }

  return {
    id: input.characterId,
    version: nextVersion,
    status: moderationStatus,
    visibility,
    character: payload,
  };
}

async function assertApiReady() {
  const health = await getJson("/health");

  if (health.status !== "ok") {
    throw new Error(`API is not healthy: ${JSON.stringify(health)}`);
  }
}

function cleanLocalMedia() {
  const workspaceRoot = resolve(process.cwd());
  const mediaRoot = resolve(MEDIA_STORAGE_DIR);

  if (!mediaRoot.startsWith(`${workspaceRoot}\\`) && !mediaRoot.startsWith(`${workspaceRoot}/`)) {
    throw new Error(`Refusing to clean media outside the workspace: ${mediaRoot}`);
  }

  if (existsSync(mediaRoot)) {
    rmSync(mediaRoot, { recursive: true, force: true });
  }
}

async function generatePortrait(character, index) {
  if (process.env.XAI_API_KEY) {
    try {
      const response = await fetch(`${XAI_BASE_URL}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: XAI_IMAGE_MODEL,
          prompt: character.imagePrompt,
          response_format: "b64_json",
          aspect_ratio: "3:4",
          resolution: "1k",
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          `xAI image HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`,
        );
      }

      const image = payload.data?.[0];

      if (image?.b64_json) {
        return Buffer.from(image.b64_json, "base64");
      }

      if (image?.url) {
        const download = await fetch(image.url);

        if (!download.ok) {
          throw new Error(`image download HTTP ${download.status}`);
        }

        return Buffer.from(await download.arrayBuffer());
      }

      throw new Error("xAI image response did not include b64_json or url.");
    } catch (error) {
      console.warn(`xAI image fallback for ${character.name}: ${errorMessage(error)}`);
    }
  }

  return renderLocalPortrait(character, index);
}

async function renderLocalPortrait(character, index) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
  const palette = localPortraitPalettes[index % localPortraitPalettes.length];
  const initials = character.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  await page.setContent(`<!doctype html>
<html>
  <body>
    <main class="portrait">
      <div class="halo"></div>
      <div class="figure">
        <div class="hair"></div>
        <div class="face">${initials}</div>
        <div class="shoulders"></div>
      </div>
      <div class="caption">${escapeHtml(character.name)}</div>
    </main>
    <style>
      html, body { margin: 0; width: 768px; height: 1024px; background: ${palette[0]}; font-family: Arial, sans-serif; }
      .portrait { position: relative; width: 768px; height: 1024px; overflow: hidden; background: ${palette[0]}; }
      .halo { position: absolute; inset: 90px 90px auto; height: 540px; border: 2px solid ${palette[1]}; border-radius: 50%; box-shadow: 0 0 80px ${palette[1]}; opacity: .9; }
      .figure { position: absolute; left: 104px; right: 104px; bottom: 130px; height: 720px; }
      .hair { position: absolute; left: 40px; right: 40px; top: 0; height: 560px; background: #0d0c10; border-radius: 280px 280px 180px 180px; box-shadow: inset 34px 0 0 ${palette[1]}, inset -28px 0 0 #151118; }
      .face { position: absolute; left: 150px; top: 150px; width: 260px; height: 330px; display: grid; place-items: center; background: ${palette[2]}; color: ${palette[1]}; border-radius: 48% 48% 45% 45%; font-size: 92px; font-weight: 900; letter-spacing: 4px; box-shadow: 0 24px 80px rgba(0,0,0,.55); }
      .shoulders { position: absolute; left: 40px; right: 40px; bottom: 0; height: 250px; background: #111015; border: 2px solid ${palette[1]}; border-radius: 220px 220px 28px 28px; box-shadow: 0 -30px 80px rgba(255,31,122,.25); }
      .caption { position: absolute; left: 64px; right: 64px; bottom: 52px; color: white; font-size: 46px; font-weight: 900; text-align: center; text-shadow: 0 6px 20px black; }
    </style>
  </body>
</html>`);
  const buffer = await page.locator(".portrait").screenshot({ type: "png" });
  await browser.close();

  return buffer;
}

async function uploadMedia(character, buffer, token) {
  const mimeType = detectMime(buffer);
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";

  return postJson(
    "/v1/media",
    {
      purpose: "character_avatar",
      fileName: `${slugify(character.name)}.${extension}`,
      mimeType,
      contentBase64: buffer.toString("base64"),
    },
    token,
  );
}

function characterPayload(character, imageUrl) {
  return {
    name: character.name,
    description: character.description,
    greeting: character.greeting,
    personaPrompt: character.persona,
    scenarioPrompt: character.scenario,
    firstMessageStyle:
      character.firstMessageStyle ||
      "Use one short, concrete, character-specific italic action beat when the scene starts, then dialogue. Avoid generic head tilts, soft smiles, and repeated filler movement.",
    creatorNotes:
      "Seeded local testing character. Keep continuity strong, keep replies concise, make memories visible through behavior, and vary roleplay actions through setting, props, posture, gaze, and emotional subtext.",
    speakingStyle: character.speakingStyle,
    personalityTraits: character.traits,
    exampleDialogues: [],
    avatarUrl: imageUrl,
    coverImageUrl: imageUrl,
    templateId: character.templateId,
    marketplaceCategory: character.category,
    marketplacePreview: character.marketplacePreview,
    modelProfile: character.modelProfile,
    rating: character.rating,
    tags: character.tags,
    isPrivate: character.isPrivate,
    priceCents: character.priceCents,
    monetizationEnabled: character.priceCents > 0,
  };
}

function moderationStatusForRating(rating) {
  return rating === "general" || rating === "teen" ? "approved" : "pending_review";
}

async function seedConversation(input) {
  const [primaryMemory, secondaryMemory] = input.character.memoryTexts;
  const chat = await postJson(
    "/v1/chat/messages",
    {
      characterId: input.characterId,
      content: `Start a fresh persona test with ${input.character.name}. My name is Afnan.`,
      clientMessageId: `seed-${slugify(input.character.name)}-${Date.now()}-${input.index}`,
      adultModeRequested: input.character.rating === "adult" || input.character.rating === "mature",
    },
    input.token,
  );

  if (!chat.accepted || !chat.conversationId) {
    throw new Error(`Chat seed failed for ${input.character.name}: ${summarize(chat)}`);
  }

  const created = await postJson(
    "/v1/memories",
    {
      characterId: input.characterId,
      conversationId: chat.conversationId,
      kind: "preference",
      text: primaryMemory,
      importance: 0.86,
    },
    input.token,
  );

  await postJson(
    "/v1/memories",
    {
      characterId: input.characterId,
      conversationId: chat.conversationId,
      kind:
        input.character.rating === "adult" || input.character.rating === "mature"
          ? "boundary"
          : "style",
      text: secondaryMemory,
      importance: 0.78,
    },
    input.token,
  );

  return { conversationId: chat.conversationId, firstMemoryId: created.id };
}

async function seedEngagement(characterId, token, index) {
  const events = [
    ...Array.from({ length: 5 + index }, () => "view"),
    ...Array.from({ length: 2 + (index % 4) }, () => "profile_open"),
    ...Array.from({ length: 1 + (index % 3) }, () => "like"),
    ...(index % 2 === 0 ? ["save"] : []),
  ];

  for (const type of events) {
    await postJson(`/v1/characters/${encodeURIComponent(characterId)}/events`, { type }, token);
  }
}

async function getJson(path, token) {
  return requestJson("GET", path, undefined, token);
}

async function postJson(path, body, token) {
  return requestJson("POST", path, body, token);
}

async function patchJson(path, body, token) {
  return requestJson("PATCH", path, body, token);
}

async function requestJson(method, path, body, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}: ${summarize(payload)}`);
  }

  return payload;
}

async function parseResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function detectMime(buffer) {
  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return "image/png";
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  throw new Error(
    `Unsupported generated image signature: ${buffer.subarray(0, 12).toString("hex")}`,
  );
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function summarize(value) {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }

  return JSON.stringify(value).slice(0, 500);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

function loadDotEnv(path) {
  if (!existsSync(path)) {
    return;
  }

  const source = readFileSync(path, "utf8");

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey.trim();
    let value = rawValue.join("=").trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
