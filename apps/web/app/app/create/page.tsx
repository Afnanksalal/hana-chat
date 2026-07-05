"use client";

import {
  CheckCircle2,
  Image as ImageIcon,
  MessageSquareText,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Tags,
  UploadCloud,
  UserRound,
  Wand2,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PremiumSelect } from "../../components/premium-select";
import { apiJson, money } from "../api";
import { renderRoleplayPreview } from "../roleplay-preview";

type Rating = "general" | "teen" | "mature" | "adult";
type ModelProfile = "fast" | "balanced" | "immersive" | "premium";
type ImageArtDirection =
  | "anime"
  | "semi_real"
  | "cinematic"
  | "editorial"
  | "painted"
  | "comic"
  | "soft_3d";
type ImageMood = "auto" | "soft" | "dramatic" | "neon" | "cozy" | "dark" | "spicy" | "fantasy";
type ImageBackdrop =
  | "auto"
  | "studio"
  | "city"
  | "nature"
  | "cafe"
  | "bedroom"
  | "fantasy"
  | "nightlife";
type ImageDetailLevel = "clean" | "balanced" | "rich";
type BuilderStep = "identity" | "appearance" | "persona" | "marketplace" | "review";
type CharacterGender = "female" | "male" | "nonbinary" | "fluid" | "unspecified";
type CharacterBodyType = "slim" | "athletic" | "curvy" | "soft" | "tall" | "petite";
type FieldErrorKey =
  | "name"
  | "description"
  | "personaPrompt"
  | "scenarioPrompt"
  | "speakingStyle"
  | "firstMessageStyle"
  | "creatorNotes"
  | "greeting"
  | "marketplacePreview"
  | "tagsText"
  | "traitsText"
  | "exampleDialoguesText"
  | "priceDollars";

interface CharacterSummary {
  id: string;
  name: string;
  description: string;
  visibility: string;
  moderationStatus: string;
  rating: Rating;
  tags: string[];
  avatarUrl?: string;
  marketplaceCategory?: string;
  marketplacePreview?: string;
  modelProfile?: ModelProfile;
  priceCents: number;
  monetizationEnabled: boolean;
}

interface MediaAssetResponse {
  id: string;
  url: string;
  purpose: "character_avatar" | "character_cover";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  fileName: string;
  provider?: "xai";
  model?: string;
}

interface GeneratedMediaChoice {
  id: string;
  url: string;
}

interface BillingAvailabilityResponse {
  monetizationEnabled: boolean;
  comingSoon: boolean;
}

interface CharacterTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  personaPrompt: string;
  greeting: string;
  scenarioPrompt: string;
  speakingStyle: string;
  firstMessageStyle: string;
  traits: string[];
  tags: string[];
  rating: Rating;
  modelProfile: ModelProfile;
  marketplacePreview: string;
}

const defaultBuilderGender: CharacterGender = "unspecified";
const defaultBuilderBodyType: CharacterBodyType = "soft";
const defaultBuilderArtDirection: ImageArtDirection = "semi_real";
const avatarChoices = [
  defaultAvatarForProfile(
    defaultBuilderGender,
    defaultBuilderBodyType,
    defaultBuilderArtDirection,
    0,
  ),
  defaultAvatarForProfile(
    defaultBuilderGender,
    defaultBuilderBodyType,
    defaultBuilderArtDirection,
    1,
  ),
  defaultAvatarForProfile(
    defaultBuilderGender,
    defaultBuilderBodyType,
    defaultBuilderArtDirection,
    2,
  ),
];
const defaultCoverImageUrl = defaultCoverForProfile("romance", defaultBuilderArtDirection, 0);
const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const maxClientUploadBytes = 5 * 1024 * 1024;
const maxGeneratedMediaPromptChars = 3_900;
const maxGeneratedMediaStyleChars = 560;
const maxGeneratedImageChoices = 3;
const fieldLimits = {
  name: 80,
  description: 800,
  greeting: 1_200,
  personaPrompt: 8_000,
  scenarioPrompt: 2_500,
  firstMessageStyle: 240,
  creatorNotes: 1_500,
  speakingStyle: 500,
  marketplacePreview: 220,
  tags: 12,
  traits: 10,
  listItem: 32,
  exampleDialogues: 8,
  exampleDialogue: 500,
} as const;
const builderSteps: Array<{
  id: BuilderStep;
  label: string;
  summary: string;
}> = [
  { id: "identity", label: "Identity", summary: "Name, pitch, and gender" },
  { id: "appearance", label: "Look", summary: "Body, style, and images" },
  { id: "persona", label: "Persona", summary: "Style, scene, and memory hooks" },
  { id: "marketplace", label: "Publish", summary: "Tags, rating, and access" },
  { id: "review", label: "Review", summary: "Final check" },
];
const categoryOptions = [
  { value: "romance", label: "Romance" },
  { value: "fantasy", label: "Fantasy" },
  { value: "comfort", label: "Comfort" },
  { value: "drama", label: "Drama" },
  { value: "anime", label: "Anime" },
  { value: "original", label: "Original" },
];
const ratingOptions: Array<{ value: Rating; label: string }> = [
  { value: "general", label: "General" },
  { value: "teen", label: "Teen" },
  { value: "mature", label: "Mature" },
  { value: "adult", label: "Adult" },
];
const imageArtDirectionOptions: Array<{ value: ImageArtDirection; label: string }> = [
  { value: "anime", label: "Anime / visual novel" },
  { value: "semi_real", label: "Semi-real character art" },
  { value: "cinematic", label: "Cinematic realism" },
  { value: "editorial", label: "Fashion editorial" },
  { value: "painted", label: "Digital painting" },
  { value: "comic", label: "Comic / graphic novel" },
  { value: "soft_3d", label: "Soft 3D render" },
];
const imageMoodOptions: Array<{ value: ImageMood; label: string }> = [
  { value: "auto", label: "Auto from persona" },
  { value: "soft", label: "Soft" },
  { value: "dramatic", label: "Dramatic" },
  { value: "neon", label: "Neon" },
  { value: "cozy", label: "Cozy" },
  { value: "dark", label: "Dark" },
  { value: "spicy", label: "Spicy" },
  { value: "fantasy", label: "Fantasy" },
];
const imageBackdropOptions: Array<{ value: ImageBackdrop; label: string }> = [
  { value: "auto", label: "Auto from scene" },
  { value: "studio", label: "Studio portrait" },
  { value: "city", label: "City / street" },
  { value: "nature", label: "Nature" },
  { value: "cafe", label: "Cafe / lounge" },
  { value: "bedroom", label: "Private room" },
  { value: "fantasy", label: "Fantasy world" },
  { value: "nightlife", label: "Nightlife" },
];
const imageDetailOptions: Array<{ value: ImageDetailLevel; label: string }> = [
  { value: "clean", label: "Clean" },
  { value: "balanced", label: "Balanced" },
  { value: "rich", label: "Rich detail" },
];
const genderOptions: Array<{ value: CharacterGender; label: string; detail: string }> = [
  { value: "unspecified", label: "Open", detail: "Let the persona define the exact identity." },
  { value: "female", label: "Female", detail: "Feminine-coded presence and styling." },
  { value: "male", label: "Male", detail: "Masculine-coded presence and styling." },
  { value: "nonbinary", label: "Nonbinary", detail: "Androgynous or nonbinary presentation." },
  { value: "fluid", label: "Fluid", detail: "Flexible presentation across scenes." },
];
const bodyTypeOptions: Array<{ value: CharacterBodyType; label: string; detail: string }> = [
  { value: "soft", label: "Soft", detail: "Gentle, approachable silhouette." },
  { value: "slim", label: "Slim", detail: "Light frame and clean lines." },
  { value: "athletic", label: "Athletic", detail: "Fit, active, energetic posture." },
  { value: "curvy", label: "Curvy", detail: "Fuller figure and expressive shape." },
  { value: "tall", label: "Tall", detail: "Long frame with a confident stance." },
  { value: "petite", label: "Petite", detail: "Compact frame and delicate styling." },
];

const templates: CharacterTemplate[] = [
  {
    id: "soft-romance",
    name: "Soft Romance",
    category: "romance",
    description: "Tender slow-burn companion with warm emotional continuity.",
    personaPrompt:
      "You are a soft-spoken anime companion who remembers emotional details, keeps tension subtle, and makes every reply feel personal. You are affectionate, patient, and grounded.",
    greeting: "You are back. I saved the quiet part of the evening for us.",
    scenarioPrompt: "A late-night private chat where the relationship deepens through continuity.",
    speakingStyle: "warm, intimate, concise, emotionally specific",
    firstMessageStyle: "gentle welcome with a remembered detail",
    traits: ["warm", "loyal", "observant", "slow-burn"],
    tags: ["romance", "anime", "comfort"],
    rating: "teen",
    modelProfile: "balanced",
    marketplacePreview: "A soft companion who remembers the tiny things.",
  },
  {
    id: "sharp-rival",
    name: "Sharp Rival",
    category: "drama",
    description: "Competitive, teasing, and loyal once trust is earned.",
    personaPrompt:
      "You are a sharp-tongued rival with confidence, dry humor, and protective loyalty. You challenge the user, but never flatten their agency.",
    greeting: "Took you long enough. Try not to make this boring.",
    scenarioPrompt: "A rivalry that turns into trust through charged, witty scenes.",
    speakingStyle: "quick, teasing, direct, never generic",
    firstMessageStyle: "confident challenge with a hook",
    traits: ["teasing", "confident", "protective", "witty"],
    tags: ["rival", "drama", "banter"],
    rating: "teen",
    modelProfile: "immersive",
    marketplacePreview: "A rival who keeps score and remembers every move.",
  },
  {
    id: "fantasy-companion",
    name: "Fantasy Companion",
    category: "fantasy",
    description: "Quest-ready companion for lore-heavy roleplay.",
    personaPrompt:
      "You are a fantasy companion with strong world awareness, cinematic pacing, and a steady bond with the user. You keep lore consistent and ask vivid scene-setting questions.",
    greeting: "The lanterns are still burning. Tell me where the road takes us next.",
    scenarioPrompt: "A serialized fantasy journey with persistent lore and relationship memory.",
    speakingStyle: "cinematic, sensory, loyal, lore-aware",
    firstMessageStyle: "scene-setting with an immediate choice",
    traits: ["loyal", "brave", "lore-aware", "cinematic"],
    tags: ["fantasy", "adventure", "story"],
    rating: "general",
    modelProfile: "immersive",
    marketplacePreview: "A story partner built for long arcs and remembered lore.",
  },
  {
    id: "comfort-friend",
    name: "Comfort Friend",
    category: "comfort",
    description: "Gentle daily companion for check-ins, warmth, and continuity.",
    personaPrompt:
      "You are a gentle companion who offers grounded support, warm humor, and continuity without pretending to be a therapist. You remember preferences and keep the user moving softly.",
    greeting: "Hey. Sit with me for a minute. How did today land on you?",
    scenarioPrompt: "A daily companion space focused on mood, rituals, and small wins.",
    speakingStyle: "calm, affirming, practical, emotionally clear",
    firstMessageStyle: "light check-in with a simple next step",
    traits: ["gentle", "steady", "playful", "supportive"],
    tags: ["comfort", "daily", "friend"],
    rating: "general",
    modelProfile: "fast",
    marketplacePreview: "A cozy friend who remembers your daily rhythm.",
  },
];

export default function CreatePage() {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [activeBuilderStep, setActiveBuilderStep] = useState<BuilderStep>("identity");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [scenarioPrompt, setScenarioPrompt] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [firstMessageStyle, setFirstMessageStyle] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [greeting, setGreeting] = useState("");
  const [gender, setGender] = useState<CharacterGender>(defaultBuilderGender);
  const [bodyType, setBodyType] = useState<CharacterBodyType>(defaultBuilderBodyType);
  const [avatarUrl, setAvatarUrl] = useState(
    avatarChoices[0] ?? "/assets/character-avatar-default.svg",
  );
  const [coverImageUrl, setCoverImageUrl] = useState(defaultCoverImageUrl);
  const [avatarWasCustomized, setAvatarWasCustomized] = useState(false);
  const [coverWasCustomized, setCoverWasCustomized] = useState(false);
  const [avatarGeneratedChoices, setAvatarGeneratedChoices] = useState<GeneratedMediaChoice[]>([]);
  const [coverGeneratedChoices, setCoverGeneratedChoices] = useState<GeneratedMediaChoice[]>([]);
  const [templateId, setTemplateId] = useState("blank");
  const [marketplaceCategory, setMarketplaceCategory] = useState("romance");
  const [marketplacePreview, setMarketplacePreview] = useState("");
  const [tagsText, setTagsText] = useState("romance, memory, companion");
  const [traitsText, setTraitsText] = useState("warm, observant, loyal");
  const [exampleDialoguesText, setExampleDialoguesText] = useState("");
  const [modelProfile, setModelProfile] = useState<ModelProfile>("balanced");
  const [rating, setRating] = useState<Rating>("teen");
  const [isPrivate, setIsPrivate] = useState(true);
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);
  const [monetizationAvailable, setMonetizationAvailable] = useState(false);
  const [priceDollars, setPriceDollars] = useState(0);
  const [status, setStatus] = useState("Loading creator studio...");
  const [avatarUploadStatus, setAvatarUploadStatus] = useState("PNG, JPG, or WebP up to 5MB.");
  const [coverUploadStatus, setCoverUploadStatus] = useState("Wide image, PNG, JPG, or WebP.");
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [imageArtDirection, setImageArtDirection] = useState<ImageArtDirection>(
    defaultBuilderArtDirection,
  );
  const [imageMood, setImageMood] = useState<ImageMood>("auto");
  const [imageBackdrop, setImageBackdrop] = useState<ImageBackdrop>("auto");
  const [imageDetailLevel, setImageDetailLevel] = useState<ImageDetailLevel>("balanced");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void loadCharacters();
  }, []);

  const previewTags = useMemo(() => parseList(tagsText).slice(0, 4), [tagsText]);
  const previewTraits = useMemo(
    () => parseList(traitsText, fieldLimits.traits).slice(0, 4),
    [traitsText],
  );
  const activeStepIndex = builderSteps.findIndex((step) => step.id === activeBuilderStep);
  const suggestedAvatarChoices = useMemo(
    () =>
      [0, 1, 2].map((variant) =>
        defaultAvatarForProfile(gender, bodyType, imageArtDirection, variant),
      ),
    [bodyType, gender, imageArtDirection],
  );
  const suggestedCoverChoices = useMemo(
    () =>
      [0, 1, 2].map((variant) =>
        defaultCoverForProfile(marketplaceCategory, imageArtDirection, variant),
      ),
    [imageArtDirection, marketplaceCategory],
  );
  const safeActiveStepIndex = activeStepIndex < 0 ? 0 : activeStepIndex;

  useEffect(() => {
    if (!avatarWasCustomized) {
      setAvatarUrl(defaultAvatarForProfile(gender, bodyType, imageArtDirection, 0));
    }
  }, [avatarWasCustomized, bodyType, gender, imageArtDirection]);

  useEffect(() => {
    if (!coverWasCustomized) {
      setCoverImageUrl(defaultCoverForProfile(marketplaceCategory, imageArtDirection, 0));
    }
  }, [coverWasCustomized, imageArtDirection, marketplaceCategory]);

  async function loadCharacters() {
    try {
      const [payload, billing] = await Promise.all([
        apiJson<{ characters: CharacterSummary[] }>("/api/v1/characters/mine"),
        apiJson<BillingAvailabilityResponse>("/api/v1/billing/plans"),
      ]);
      setCharacters(payload.characters);
      setMonetizationAvailable(billing.monetizationEnabled && !billing.comingSoon);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load your characters.");
    }
  }

  function clearFieldError(key: FieldErrorKey) {
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateField(key: FieldErrorKey, setter: (value: string) => void, value: string) {
    setter(value);
    clearFieldError(key);
  }

  function updateGender(nextGender: CharacterGender) {
    setGender(nextGender);
  }

  function updateBodyType(nextBodyType: CharacterBodyType) {
    setBodyType(nextBodyType);
  }

  function selectSuggestedAvatar(choice: string) {
    setAvatarWasCustomized(false);
    setAvatarUrl(choice);
  }

  function selectSuggestedCover(choice: string) {
    setCoverWasCustomized(false);
    setCoverImageUrl(choice);
  }

  function selectGeneratedAvatar(choice: string) {
    setAvatarWasCustomized(true);
    setAvatarUrl(choice);
  }

  function selectGeneratedCover(choice: string) {
    setCoverWasCustomized(true);
    setCoverImageUrl(choice);
  }

  function coverReferenceImageUrl(): string {
    return isGeneratedOrUploadedMediaUrl(avatarUrl) ? avatarUrl : "";
  }

  function applyTemplate(template: CharacterTemplate) {
    const nextArtDirection = imageArtDirectionForTemplate(template);
    const nextMood = imageMoodForTemplate(template);
    const nextGender = genderForTemplate(template);
    const nextBodyType = bodyTypeForTemplate(template);

    setTemplateId(template.id);
    setName(template.name);
    setMarketplaceCategory(template.category);
    setDescription(template.description);
    setPersonaPrompt(template.personaPrompt);
    setGreeting(template.greeting);
    setScenarioPrompt(template.scenarioPrompt);
    setSpeakingStyle(template.speakingStyle);
    setFirstMessageStyle(template.firstMessageStyle);
    setTraitsText(template.traits.join(", "));
    setTagsText(template.tags.join(", "));
    setRating(template.rating);
    setModelProfile(template.modelProfile);
    setMarketplacePreview(template.marketplacePreview);
    setGender(nextGender);
    setBodyType(nextBodyType);
    setImageArtDirection(nextArtDirection);
    setImageMood(nextMood);
    setImageBackdrop(template.category === "fantasy" ? "fantasy" : "auto");
    setFieldErrors({});
    setActiveBuilderStep("identity");
    setStatus(`${template.name} template applied.`);
  }

  function collectBuilderErrors(): Partial<Record<FieldErrorKey, string>> {
    const errors: Partial<Record<FieldErrorKey, string>> = {};
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedPersona = personaPrompt.trim();
    const trimmedGreeting = greeting.trim();

    if (!trimmedName) {
      errors.name = "Enter a character name.";
    } else if (trimmedName.length > fieldLimits.name) {
      errors.name = `Character name must be ${fieldLimits.name} characters or less.`;
    }

    if (!trimmedDescription) {
      errors.description = "Enter a marketplace description.";
    } else if (trimmedDescription.length > fieldLimits.description) {
      errors.description = `Description must be ${fieldLimits.description} characters or less.`;
    }

    if (!trimmedPersona) {
      errors.personaPrompt = "Write the core persona so the model has a stable identity.";
    } else if (trimmedPersona.length > fieldLimits.personaPrompt) {
      errors.personaPrompt = `Core persona must be ${fieldLimits.personaPrompt.toLocaleString()} characters or less.`;
    }

    if (!trimmedGreeting) {
      errors.greeting = "Add the first message people see when they open the chat.";
    } else if (trimmedGreeting.length > fieldLimits.greeting) {
      errors.greeting = `Greeting must be ${fieldLimits.greeting.toLocaleString()} characters or less.`;
    }

    if (scenarioPrompt.length > fieldLimits.scenarioPrompt) {
      errors.scenarioPrompt = `Scenario must be ${fieldLimits.scenarioPrompt.toLocaleString()} characters or less.`;
    }

    if (speakingStyle.length > fieldLimits.speakingStyle) {
      errors.speakingStyle = `Speaking style must be ${fieldLimits.speakingStyle} characters or less.`;
    }

    if (firstMessageStyle.length > fieldLimits.firstMessageStyle) {
      errors.firstMessageStyle = `First message style must be ${fieldLimits.firstMessageStyle} characters or less.`;
    }

    if (creatorNotes.length > fieldLimits.creatorNotes) {
      errors.creatorNotes = `Creator notes must be ${fieldLimits.creatorNotes.toLocaleString()} characters or less.`;
    }

    if (marketplacePreview.length > fieldLimits.marketplacePreview) {
      errors.marketplacePreview = `Preview line must be ${fieldLimits.marketplacePreview} characters or less.`;
    }

    const tagError = listLimitError(tagsText, fieldLimits.tags, fieldLimits.listItem, "Tags");
    if (tagError) {
      errors.tagsText = tagError;
    }

    const traitError = listLimitError(
      traitsText,
      fieldLimits.traits,
      fieldLimits.listItem,
      "Personality traits",
    );
    if (traitError) {
      errors.traitsText = traitError;
    }

    const dialogueError = lineLimitError(
      exampleDialoguesText,
      fieldLimits.exampleDialogues,
      fieldLimits.exampleDialogue,
      "Example dialogue",
    );
    if (dialogueError) {
      errors.exampleDialoguesText = dialogueError;
    }

    if (monetizationAvailable && monetizationEnabled) {
      if (!Number.isFinite(priceDollars) || priceDollars < 0 || priceDollars > 99.99) {
        errors.priceDollars = "Paid price must be between $0.00 and $99.99.";
      }
    }

    return errors;
  }

  function validateBuilderStep(step: BuilderStep): boolean {
    const errors = collectBuilderErrors();
    const stepKeys = fieldKeysForStep(step);
    const stepErrors = Object.fromEntries(
      Object.entries(errors).filter(([key]) => stepKeys.includes(key as FieldErrorKey)),
    ) as Partial<Record<FieldErrorKey, string>>;

    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of stepKeys) {
        delete next[key];
      }
      return { ...next, ...stepErrors };
    });

    if (Object.keys(stepErrors).length > 0) {
      setStatus("Fix the highlighted fields before continuing.");
      return false;
    }

    setStatus("");
    return true;
  }

  function goToBuilderStep(step: BuilderStep) {
    const nextIndex = builderSteps.findIndex((item) => item.id === step);

    if (nextIndex <= safeActiveStepIndex || validateBuilderStep(activeBuilderStep)) {
      setActiveBuilderStep(step);
    }
  }

  function goToNextStep() {
    if (!validateBuilderStep(activeBuilderStep)) {
      return;
    }

    const nextStep = builderSteps[safeActiveStepIndex + 1];
    if (nextStep) {
      setActiveBuilderStep(nextStep.id);
    }
  }

  async function saveCharacter() {
    const errors = collectBuilderErrors();

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setActiveBuilderStep(firstStepWithError(errors));
      setStatus("Fix the highlighted fields, then save again.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Saving character...");

    try {
      await apiJson<{ id: string }>("/api/v1/characters", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          personaPrompt: personaPrompt.trim(),
          scenarioPrompt: scenarioPrompt.trim(),
          firstMessageStyle: firstMessageStyle.trim(),
          creatorNotes: composeCreatorNotes(creatorNotes, {
            gender,
            bodyType,
            artDirection: imageArtDirection,
          }),
          speakingStyle: speakingStyle.trim(),
          personalityTraits: parseList(traitsText, fieldLimits.traits),
          exampleDialogues: parseLines(exampleDialoguesText),
          avatarUrl,
          coverImageUrl,
          templateId,
          marketplaceCategory,
          marketplacePreview: marketplacePreview.trim(),
          modelProfile,
          greeting: greeting.trim(),
          rating,
          tags: parseList(tagsText),
          isPrivate,
          monetizationEnabled: monetizationAvailable && monetizationEnabled,
          priceCents:
            monetizationAvailable && monetizationEnabled ? Math.round(priceDollars * 100) : 0,
        }),
      });
      setName("");
      setDescription("");
      setPersonaPrompt("");
      setScenarioPrompt("");
      setFirstMessageStyle("");
      setCreatorNotes("");
      setSpeakingStyle("");
      setGreeting("");
      setMarketplacePreview("");
      setExampleDialoguesText("");
      setTemplateId("blank");
      setGender(defaultBuilderGender);
      setBodyType(defaultBuilderBodyType);
      setImageArtDirection(defaultBuilderArtDirection);
      setImageMood("auto");
      setImageBackdrop("auto");
      setImageDetailLevel("balanced");
      setAvatarWasCustomized(false);
      setCoverWasCustomized(false);
      setAvatarGeneratedChoices([]);
      setCoverGeneratedChoices([]);
      setFieldErrors({});
      setActiveBuilderStep("identity");
      setStatus("Character saved.");
      await loadCharacters();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function uploadCharacterImage(
    file: File | undefined,
    purpose: "character_avatar" | "character_cover",
  ) {
    if (!file) {
      return;
    }

    const setUploadStatus =
      purpose === "character_avatar" ? setAvatarUploadStatus : setCoverUploadStatus;

    if (!acceptedImageTypes.includes(file.type)) {
      setUploadStatus("Use a PNG, JPG, or WebP image.");
      return;
    }

    if (file.size > maxClientUploadBytes) {
      setUploadStatus("Image must be 5MB or smaller.");
      return;
    }

    setUploadStatus("Uploading...");

    try {
      const contentBase64 = await fileToDataUrl(file);
      const media = await apiJson<MediaAssetResponse>("/api/v1/media", {
        method: "POST",
        body: JSON.stringify({
          purpose,
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
        }),
      });

      if (purpose === "character_avatar") {
        setAvatarUrl(media.url);
        setAvatarWasCustomized(true);
        setAvatarUploadStatus("Profile image uploaded.");
      } else {
        setCoverImageUrl(media.url);
        setCoverWasCustomized(true);
        setCoverUploadStatus("Cover image uploaded.");
      }
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function generateCharacterImage(purpose: "character_avatar" | "character_cover") {
    const setUploadStatus =
      purpose === "character_avatar" ? setAvatarUploadStatus : setCoverUploadStatus;
    const setGenerating =
      purpose === "character_avatar" ? setIsGeneratingAvatar : setIsGeneratingCover;
    const currentChoices =
      purpose === "character_avatar" ? avatarGeneratedChoices : coverGeneratedChoices;

    if (currentChoices.length >= maxGeneratedImageChoices) {
      setUploadStatus(
        `Choose one of the ${maxGeneratedImageChoices} generated options or upload your own.`,
      );
      return;
    }

    setGenerating(true);
    setUploadStatus(
      `Generating option ${currentChoices.length + 1} of ${maxGeneratedImageChoices}...`,
    );

    try {
      const tags = parseList(tagsText);
      const traits = parseList(traitsText, fieldLimits.traits);
      const style = trimGeneratedMediaText(
        imageStyleForCharacter({
          artDirection: imageArtDirection,
          mood: imageMood,
          backdrop: imageBackdrop,
          detailLevel: imageDetailLevel,
          rating,
          gender,
          bodyType,
          tags,
          category: marketplaceCategory,
        }),
        maxGeneratedMediaStyleChars,
      );
      const prompt = trimGeneratedMediaText(
        generatedImagePrompt({
          purpose,
          name,
          description,
          marketplacePreview,
          personaPrompt,
          scenarioPrompt,
          speakingStyle,
          firstMessageStyle,
          creatorNotes,
          tags,
          traits,
          rating,
          gender,
          bodyType,
          artDirection: imageArtDirection,
          mood: imageMood,
          backdrop: imageBackdrop,
          detailLevel: imageDetailLevel,
          hasReferenceImage: purpose === "character_cover" && Boolean(coverReferenceImageUrl()),
        }),
        maxGeneratedMediaPromptChars,
      );
      const referenceImageUrl = purpose === "character_cover" ? coverReferenceImageUrl() : "";
      const media = await apiJson<MediaAssetResponse>("/api/v1/media/generate", {
        method: "POST",
        body: JSON.stringify({
          purpose,
          characterName: name,
          style,
          artDirection: imageArtDirection,
          mood: imageMood,
          backdrop: imageBackdrop,
          detailLevel: imageDetailLevel,
          aspectRatio: purpose === "character_avatar" ? "1:1" : "16:9",
          referenceImageUrl,
          prompt,
        }),
      });

      if (purpose === "character_avatar") {
        const shouldSelectGeneratedAvatar =
          !avatarWasCustomized && avatarGeneratedChoices.length === 0;

        if (shouldSelectGeneratedAvatar) {
          setAvatarUrl(media.url);
          setAvatarWasCustomized(true);
        }
        setAvatarGeneratedChoices((current) =>
          appendGeneratedChoice(current, { id: media.id, url: media.url }),
        );
        setAvatarUploadStatus(
          shouldSelectGeneratedAvatar
            ? "Profile option generated and selected."
            : "Profile option generated. Select it to use it.",
        );
      } else {
        const shouldSelectGeneratedCover =
          !coverWasCustomized && coverGeneratedChoices.length === 0;

        if (shouldSelectGeneratedCover) {
          setCoverImageUrl(media.url);
          setCoverWasCustomized(true);
        }
        setCoverGeneratedChoices((current) =>
          appendGeneratedChoice(current, { id: media.id, url: media.url }),
        );
        setCoverUploadStatus(
          shouldSelectGeneratedCover
            ? referenceImageUrl
              ? "Cover option generated from the selected profile image."
              : "Cover option generated and selected."
            : "Cover option generated. Select it to use it.",
        );
      }
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function publishCharacter(character: CharacterSummary) {
    setStatus(`Publishing ${character.name}...`);

    try {
      const result = await apiJson<{
        published: boolean;
        moderationStatus: string;
        visibility: string;
      }>(`/api/v1/characters/${character.id}/publish`, {
        method: "POST",
        body: JSON.stringify({
          monetizationEnabled: character.monetizationEnabled,
          priceCents: character.priceCents,
        }),
      });
      await loadCharacters();
      setStatus(result.published ? "Character published." : "Submitted for review.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publish failed.");
    }
  }

  return (
    <div className="app-page create-grid">
      <section className="page-heading">
        <span className="section-label">
          <Wand2 size={16} /> Creator studio
        </span>
        <h1>Build a character people come back to.</h1>
        <p>
          Start from a proven archetype, tune the speaking style, add a profile image, and publish
          with a marketplace-ready preview.
        </p>
      </section>

      <section className="template-strip" aria-label="Character templates">
        {templates.map((template) => (
          <button
            className={templateId === template.id ? "template-card active" : "template-card"}
            key={template.id}
            type="button"
            onClick={() => applyTemplate(template)}
          >
            <Sparkles size={18} />
            <span>{template.name}</span>
            <small>{template.description}</small>
          </button>
        ))}
      </section>

      <form
        className="creator-form builder-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveCharacter();
        }}
      >
        <div className="builder-stepper" role="list" aria-label="Character builder progress">
          {builderSteps.map((step, index) => {
            const isActive = step.id === activeBuilderStep;
            const isComplete = index < safeActiveStepIndex;

            return (
              <button
                aria-current={isActive ? "step" : undefined}
                className={
                  isActive
                    ? "builder-step-tab active"
                    : isComplete
                      ? "builder-step-tab complete"
                      : "builder-step-tab"
                }
                key={step.id}
                type="button"
                onClick={() => goToBuilderStep(step.id)}
              >
                <span className="builder-step-index">
                  {isComplete ? <CheckCircle2 size={16} /> : index + 1}
                </span>
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.summary}</small>
                </span>
              </button>
            );
          })}
        </div>

        {activeBuilderStep === "identity" ? (
          <div className="builder-step-panel" aria-labelledby="builder-identity-title">
            <FormStepHeading
              id="builder-identity-title"
              icon={<UserRound size={18} />}
              eyebrow="Step 1 of 5"
              title="Identity"
              body="Lock the premise before adding art or tuning. This keeps the model anchored."
            />
            <div className="form-grid">
              <TextInputField
                id="character-name"
                label="Character name"
                value={name}
                onChange={(value) => updateField("name", setName, value)}
                maxLength={fieldLimits.name}
                helperText="Use the name people should recognize in chat lists and discovery."
                error={fieldErrors.name}
                requiredMark
              />
              <div className="field-shell">
                <span className="field-label">Gender direction</span>
                <div className="builder-option-grid compact" role="radiogroup">
                  {genderOptions.map((option) => (
                    <button
                      aria-checked={gender === option.value}
                      className={
                        gender === option.value
                          ? "builder-option-card active"
                          : "builder-option-card"
                      }
                      key={option.value}
                      role="radio"
                      type="button"
                      onClick={() => updateGender(option.value)}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <TextAreaField
              id="character-description"
              label="Marketplace description"
              value={description}
              onChange={(value) => updateField("description", setDescription, value)}
              rows={4}
              maxLength={fieldLimits.description}
              helperText="One sharp pitch: who they are, what they offer, and why someone should start a room."
              error={fieldErrors.description}
              requiredMark
            />
          </div>
        ) : null}

        {activeBuilderStep === "appearance" ? (
          <div className="builder-step-panel" aria-labelledby="builder-appearance-title">
            <FormStepHeading
              id="builder-appearance-title"
              icon={<Palette size={18} />}
              eyebrow="Step 2 of 5"
              title="Look"
              body="Choose a body direction, visual style, and image set. Generated options are capped at three."
            />
            <div className="field-shell">
              <span className="field-label">Body type</span>
              <div className="builder-option-grid" role="radiogroup">
                {bodyTypeOptions.map((option) => (
                  <button
                    aria-checked={bodyType === option.value}
                    className={
                      bodyType === option.value
                        ? "builder-option-card active"
                        : "builder-option-card"
                    }
                    key={option.value}
                    role="radio"
                    type="button"
                    onClick={() => updateBodyType(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="field-shell">
              <span className="field-label">Visual style</span>
              <div className="builder-option-grid style-grid" role="radiogroup">
                {imageArtDirectionOptions.map((option) => (
                  <button
                    aria-checked={imageArtDirection === option.value}
                    className={
                      imageArtDirection === option.value
                        ? "builder-option-card active"
                        : "builder-option-card"
                    }
                    key={option.value}
                    role="radio"
                    type="button"
                    onClick={() => setImageArtDirection(option.value)}
                  >
                    <strong>{option.label}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="media-generation-panel">
              <div className="media-options-grid">
                <PremiumSelect
                  label="Mood"
                  value={imageMood}
                  options={imageMoodOptions}
                  onChange={setImageMood}
                />
                <PremiumSelect
                  label="Backdrop"
                  value={imageBackdrop}
                  options={imageBackdropOptions}
                  onChange={setImageBackdrop}
                />
                <PremiumSelect
                  label="Detail"
                  value={imageDetailLevel}
                  options={imageDetailOptions}
                  onChange={setImageDetailLevel}
                />
              </div>
            </div>

            <div className="builder-media-grid">
              <div className="avatar-picker media-builder-card">
                <div className="media-card-head">
                  <span>Profile image</span>
                  <small>
                    {avatarGeneratedChoices.length} / {maxGeneratedImageChoices} generated
                  </small>
                </div>
                <img src={avatarUrl} alt="Character avatar preview" />
                <div className="media-action-row">
                  <label className="media-upload-button secondary">
                    <UploadCloud size={16} />
                    Upload
                    <input
                      accept={acceptedImageTypes.join(",")}
                      data-testid="avatar-file-input"
                      name="avatarFile"
                      type="file"
                      onChange={(event) => {
                        void uploadCharacterImage(event.target.files?.[0], "character_avatar");
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="media-upload-button"
                    type="button"
                    disabled={
                      isGeneratingAvatar ||
                      avatarGeneratedChoices.length >= maxGeneratedImageChoices
                    }
                    onClick={() => void generateCharacterImage("character_avatar")}
                  >
                    <Wand2 size={16} />
                    {isGeneratingAvatar ? "Generating..." : "Generate option"}
                  </button>
                </div>
                <p className="upload-status" aria-live="polite">
                  {avatarUploadStatus}
                </p>
                {avatarGeneratedChoices.length > 0 ? (
                  <MediaChoiceRow
                    label="Generated profile options"
                    choices={avatarGeneratedChoices}
                    selectedUrl={avatarUrl}
                    onSelect={selectGeneratedAvatar}
                  />
                ) : null}
                <MediaChoiceRow
                  label="Starter profile directions"
                  choices={suggestedAvatarChoices.map((url, index) => ({
                    id: `starter-avatar-${index}`,
                    url,
                  }))}
                  selectedUrl={avatarUrl}
                  onSelect={selectSuggestedAvatar}
                />
              </div>

              <div className="cover-upload-card media-builder-card">
                <div className="media-card-head">
                  <span>Cover image</span>
                  <small>
                    {coverGeneratedChoices.length} / {maxGeneratedImageChoices} generated
                  </small>
                </div>
                <div className="cover-upload-preview">
                  <img src={coverImageUrl} alt="Character cover preview" />
                </div>
                <div className="media-action-row cover-actions">
                  <label className="media-upload-button secondary">
                    <UploadCloud size={16} />
                    Upload cover
                    <input
                      accept={acceptedImageTypes.join(",")}
                      data-testid="cover-file-input"
                      name="coverFile"
                      type="file"
                      onChange={(event) => {
                        void uploadCharacterImage(event.target.files?.[0], "character_cover");
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="media-upload-button"
                    type="button"
                    disabled={
                      isGeneratingCover || coverGeneratedChoices.length >= maxGeneratedImageChoices
                    }
                    onClick={() => void generateCharacterImage("character_cover")}
                  >
                    <Wand2 size={16} />
                    {isGeneratingCover ? "Generating..." : "Generate cover"}
                  </button>
                </div>
                <p className="upload-status" aria-live="polite">
                  {coverUploadStatus}
                </p>
                {coverGeneratedChoices.length > 0 ? (
                  <MediaChoiceRow
                    label="Generated cover options"
                    choices={coverGeneratedChoices}
                    selectedUrl={coverImageUrl}
                    onSelect={selectGeneratedCover}
                  />
                ) : null}
                <MediaChoiceRow
                  label="Starter cover directions"
                  choices={suggestedCoverChoices.map((url, index) => ({
                    id: `starter-cover-${index}`,
                    url,
                  }))}
                  selectedUrl={coverImageUrl}
                  onSelect={selectSuggestedCover}
                  wide
                />
              </div>
            </div>
          </div>
        ) : null}

        {activeBuilderStep === "persona" ? (
          <div className="builder-step-panel" aria-labelledby="builder-persona-title">
            <FormStepHeading
              id="builder-persona-title"
              icon={<MessageSquareText size={18} />}
              eyebrow="Step 3 of 5"
              title="Persona"
              body="Give the model stable behavior, scene logic, and first-turn energy."
            />
            <TextAreaField
              id="core-persona"
              label="Core persona"
              value={personaPrompt}
              onChange={(value) => updateField("personaPrompt", setPersonaPrompt, value)}
              rows={8}
              maxLength={fieldLimits.personaPrompt}
              helperText="Define identity, boundaries, relationship pace, habits, and what should never become generic."
              error={fieldErrors.personaPrompt}
              requiredMark
            />
            <TextAreaField
              id="greeting"
              label="Greeting"
              value={greeting}
              onChange={(value) => updateField("greeting", setGreeting, value)}
              rows={4}
              maxLength={fieldLimits.greeting}
              helperText="This is the first assistant message. Make it distinct and non-repetitive."
              error={fieldErrors.greeting}
              requiredMark
            />
            <div className="form-grid">
              <TextAreaField
                id="scenario"
                label="Scenario"
                value={scenarioPrompt}
                onChange={(value) => updateField("scenarioPrompt", setScenarioPrompt, value)}
                rows={4}
                maxLength={fieldLimits.scenarioPrompt}
                helperText="Starting world, room setup, conflict, or relationship premise."
                error={fieldErrors.scenarioPrompt}
              />
              <TextAreaField
                id="speaking-style"
                label="Speaking style"
                value={speakingStyle}
                onChange={(value) => updateField("speakingStyle", setSpeakingStyle, value)}
                rows={4}
                maxLength={fieldLimits.speakingStyle}
                helperText="Speaking rhythm, roleplay action style, sentence length, and emotional texture."
                error={fieldErrors.speakingStyle}
              />
            </div>
            <div className="form-grid">
              <TextInputField
                id="first-message-style"
                label="First message style"
                value={firstMessageStyle}
                onChange={(value) => updateField("firstMessageStyle", setFirstMessageStyle, value)}
                maxLength={fieldLimits.firstMessageStyle}
                helperText="Example: slow-burn tension, direct hook, cozy check-in."
                error={fieldErrors.firstMessageStyle}
              />
              <TextInputField
                id="personality-traits"
                label="Personality traits"
                value={traitsText}
                onChange={(value) => updateField("traitsText", setTraitsText, value)}
                helperText={`Comma-separated. Up to ${fieldLimits.traits} traits, ${fieldLimits.listItem} characters each.`}
                error={fieldErrors.traitsText}
              />
            </div>
            <TextAreaField
              id="example-dialogues"
              label="Example dialogue lines"
              value={exampleDialoguesText}
              onChange={(value) =>
                updateField("exampleDialoguesText", setExampleDialoguesText, value)
              }
              rows={4}
              helperText={`One example per line. Up to ${fieldLimits.exampleDialogues} lines.`}
              error={fieldErrors.exampleDialoguesText}
            />
          </div>
        ) : null}

        {activeBuilderStep === "marketplace" ? (
          <div className="builder-step-panel" aria-labelledby="builder-marketplace-title">
            <FormStepHeading
              id="builder-marketplace-title"
              icon={<Tags size={18} />}
              eyebrow="Step 4 of 5"
              title="Publish"
              body="Package discovery metadata without leaking internal mechanics."
            />
            <div className="form-grid">
              <div className="field-shell">
                <PremiumSelect
                  label="Category"
                  value={marketplaceCategory}
                  options={categoryOptions}
                  onChange={setMarketplaceCategory}
                />
                <small>Controls marketplace grouping and fallback cover direction.</small>
              </div>
              <div className="field-shell">
                <PremiumSelect
                  label="Rating"
                  value={rating}
                  options={ratingOptions}
                  onChange={setRating}
                />
                <small>Use Mature or Adult only for fictional adult characters.</small>
              </div>
            </div>
            <TextInputField
              id="marketplace-tags"
              label="Tags"
              value={tagsText}
              onChange={(value) => updateField("tagsText", setTagsText, value)}
              helperText={`Comma-separated. Up to ${fieldLimits.tags} tags, ${fieldLimits.listItem} characters each.`}
              error={fieldErrors.tagsText}
            />
            <TextInputField
              id="marketplace-preview"
              label="Preview line"
              value={marketplacePreview}
              onChange={(value) => updateField("marketplacePreview", setMarketplacePreview, value)}
              maxLength={fieldLimits.marketplacePreview}
              helperText="Short discovery copy shown on cards and search results."
              error={fieldErrors.marketplacePreview}
            />

            <div className="field-shell">
              <span className="field-label">Model profile</span>
              <div className="segmented-control" role="radiogroup" aria-label="Model profile">
                {(["fast", "balanced", "immersive", "premium"] as ModelProfile[]).map((profile) => (
                  <button
                    aria-checked={modelProfile === profile}
                    className={modelProfile === profile ? "active" : ""}
                    key={profile}
                    role="radio"
                    type="button"
                    onClick={() => setModelProfile(profile)}
                  >
                    {profile}
                  </button>
                ))}
              </div>
              <small>
                Balanced is the default for quality and cost. Immersive favors roleplay depth.
              </small>
            </div>

            <div className="form-grid">
              <div className="field-shell">
                <label htmlFor="paid-price">Paid price</label>
                <input
                  aria-describedby={
                    fieldErrors.priceDollars
                      ? "paid-price-error paid-price-help"
                      : "paid-price-help"
                  }
                  aria-invalid={Boolean(fieldErrors.priceDollars)}
                  disabled={!monetizationAvailable}
                  id="paid-price"
                  min={0}
                  max={99.99}
                  step={0.01}
                  type="number"
                  value={priceDollars}
                  onChange={(event) => {
                    setPriceDollars(Number(event.target.value));
                    clearFieldError("priceDollars");
                  }}
                />
                <small id="paid-price-help">
                  {monetizationAvailable
                    ? "Set a paid unlock price when monetization is enabled."
                    : "Paid access is gated until Stellar monetization is enabled."}
                </small>
                {fieldErrors.priceDollars ? (
                  <p className="field-error" id="paid-price-error" role="alert">
                    {fieldErrors.priceDollars}
                  </p>
                ) : null}
              </div>
              <TextInputField
                id="creator-notes"
                label="Creator notes"
                value={creatorNotes}
                onChange={(value) => updateField("creatorNotes", setCreatorNotes, value)}
                maxLength={fieldLimits.creatorNotes}
                helperText="Private steering notes. Appearance choices are appended automatically."
                error={fieldErrors.creatorNotes}
              />
            </div>

            <div className="builder-toggle-grid">
              <label className="toggle-row">
                <input
                  checked={isPrivate}
                  onChange={(event) => setIsPrivate(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Save as private draft</strong>
                  <small>Keep it out of discovery until you publish.</small>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  checked={monetizationAvailable && monetizationEnabled}
                  onChange={(event) => setMonetizationEnabled(event.target.checked)}
                  disabled={!monetizationAvailable}
                  type="checkbox"
                />
                <span>
                  <strong>
                    {monetizationAvailable ? "Enable paid access" : "Paid access coming soon"}
                  </strong>
                  <small>Stellar checkout stays disabled server-side for now.</small>
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {activeBuilderStep === "review" ? (
          <div className="builder-step-panel" aria-labelledby="builder-review-title">
            <FormStepHeading
              id="builder-review-title"
              icon={<ShieldCheck size={18} />}
              eyebrow="Step 5 of 5"
              title="Review"
              body="Check the character contract before saving. Missing required fields are shown inline."
            />
            <div className="builder-review-grid">
              <ReviewTile
                label="Identity"
                value={name || "Missing name"}
                detail={`${genderLabel(gender)} / ${bodyTypeLabel(bodyType)}`}
              />
              <ReviewTile
                label="Persona"
                value={personaPrompt ? "Core persona ready" : "Missing persona"}
                detail={`${personaPrompt.length.toLocaleString()} / ${fieldLimits.personaPrompt.toLocaleString()} characters`}
              />
              <ReviewTile
                label="Opening"
                value={greeting ? "Greeting ready" : "Missing greeting"}
                detail={firstMessageStyle || "No special first-message style"}
              />
              <ReviewTile
                label="Discovery"
                value={`${marketplaceCategory} / ${rating}`}
                detail={parseList(tagsText).join(", ") || "No tags yet"}
              />
              <ReviewTile
                label="Images"
                value={
                  avatarWasCustomized || coverWasCustomized
                    ? "Custom media selected"
                    : "Starter media selected"
                }
                detail={`${avatarGeneratedChoices.length + coverGeneratedChoices.length} generated options used this session`}
              />
              <ReviewTile
                label="Access"
                value={isPrivate ? "Private draft" : "Ready to publish"}
                detail={
                  monetizationAvailable && monetizationEnabled
                    ? money(Math.round(priceDollars * 100), "USD")
                    : "Included"
                }
              />
            </div>
          </div>
        ) : null}

        <div className="builder-footer">
          <button
            className="secondary-action compact"
            type="button"
            disabled={safeActiveStepIndex === 0}
            onClick={() => {
              const previous = builderSteps[safeActiveStepIndex - 1];
              if (previous) {
                setActiveBuilderStep(previous.id);
              }
            }}
          >
            Back
          </button>
          {safeActiveStepIndex < builderSteps.length - 1 ? (
            <button className="primary-action compact" type="button" onClick={goToNextStep}>
              Continue to {builderSteps[safeActiveStepIndex + 1]?.label}
            </button>
          ) : (
            <button className="primary-action compact" type="submit" disabled={isSubmitting}>
              <Plus size={18} /> {isSubmitting ? "Saving..." : "Save character"}
            </button>
          )}
        </div>
        {status ? (
          <p className="form-status" aria-live="polite">
            {status}
          </p>
        ) : null}
      </form>

      <aside className="creator-rail builder-preview">
        <div className="marketplace-preview-card">
          <div className="marketplace-cover">
            <img src={coverImageUrl} alt="" />
          </div>
          <div className="marketplace-avatar">
            <img src={avatarUrl} alt="" />
          </div>
          <h2>{name || "New character"}</h2>
          <p>
            {renderRoleplayPreview(
              marketplacePreview ||
                description ||
                "A memorable companion with a distinct speaking style.",
            )}
          </p>
          <div className="chip-row">
            {previewTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        {previewTraits.length > 0 ? (
          <div className="trait-stack">
            {previewTraits.map((trait) => (
              <span key={trait}>{trait}</span>
            ))}
          </div>
        ) : null}
      </aside>

      <section className="creator-list">
        {characters.map((character) => (
          <article className="settings-row creator-owned-row" key={character.id}>
            <div className="mini-avatar">
              {character.avatarUrl ? (
                <img src={character.avatarUrl} alt="" />
              ) : (
                <ImageIcon size={20} />
              )}
            </div>
            <div>
              <h2>{character.name}</h2>
              <p>
                {character.visibility} | {character.moderationStatus} |{" "}
                {character.monetizationEnabled ? money(character.priceCents, "USD") : "Included"}
              </p>
            </div>
            <button
              className="secondary-action compact"
              type="button"
              onClick={() => void publishCharacter(character)}
            >
              <UploadCloud size={16} /> Publish
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function FormStepHeading({
  id,
  icon,
  eyebrow,
  title,
  body,
}: {
  id: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="form-section-title builder-step-heading">
      {icon}
      <div>
        <span className="section-label">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}

function TextInputField({
  id,
  label,
  value,
  onChange,
  helperText,
  error,
  maxLength,
  requiredMark = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText: string;
  error?: string | undefined;
  maxLength?: number | undefined;
  requiredMark?: boolean | undefined;
}) {
  const helperId = `${id}-help`;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;
  const describedBy = [helperId, maxLength ? counterId : "", error ? errorId : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field-shell">
      <label htmlFor={id}>
        {label}
        {requiredMark ? (
          <span className="required-marker" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        aria-required={requiredMark || undefined}
        id={id}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldMeta
        helperId={helperId}
        helperText={helperText}
        counterId={counterId}
        currentLength={value.length}
        maxLength={maxLength}
      />
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  helperText,
  error,
  maxLength,
  rows,
  requiredMark = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText: string;
  error?: string | undefined;
  maxLength?: number | undefined;
  rows: number;
  requiredMark?: boolean | undefined;
}) {
  const helperId = `${id}-help`;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;
  const describedBy = [helperId, maxLength ? counterId : "", error ? errorId : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field-shell">
      <label htmlFor={id}>
        {label}
        {requiredMark ? (
          <span className="required-marker" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <textarea
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        aria-required={requiredMark || undefined}
        id={id}
        maxLength={maxLength}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldMeta
        helperId={helperId}
        helperText={helperText}
        counterId={counterId}
        currentLength={value.length}
        maxLength={maxLength}
      />
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FieldMeta({
  helperId,
  helperText,
  counterId,
  currentLength,
  maxLength,
}: {
  helperId: string;
  helperText: string;
  counterId: string;
  currentLength: number;
  maxLength?: number | undefined;
}) {
  const hasLimit = typeof maxLength === "number" && maxLength > 0;
  const progress = hasLimit ? Math.min(100, (currentLength / maxLength) * 100) : 0;
  const remaining = hasLimit ? Math.max(0, maxLength - currentLength) : 0;
  const counterClassName = [
    "field-limit-meter",
    progress >= 86 ? "near-limit" : "",
    progress >= 98 ? "at-limit" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="field-meta"
      style={hasLimit ? ({ "--field-limit-progress": `${progress}%` } as CSSProperties) : undefined}
    >
      <small className="field-helper" id={helperId}>
        {helperText}
      </small>
      {hasLimit ? (
        <small
          className={counterClassName}
          id={counterId}
          aria-live="polite"
          aria-label={`${currentLength.toLocaleString()} of ${maxLength.toLocaleString()} characters used. ${remaining.toLocaleString()} remaining.`}
        >
          <span className="field-limit-track" aria-hidden="true">
            <span />
          </span>
          <span className="character-counter">
            {currentLength.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </small>
      ) : null}
    </div>
  );
}

function MediaChoiceRow({
  label,
  choices,
  selectedUrl,
  onSelect,
  wide = false,
}: {
  label: string;
  choices: GeneratedMediaChoice[];
  selectedUrl: string;
  onSelect: (url: string) => void;
  wide?: boolean;
}) {
  return (
    <div className="media-choice-group">
      <span className="field-label">{label}</span>
      <div className={wide ? "avatar-choice-row cover-choice-row" : "avatar-choice-row"}>
        {choices.map((choice, index) => (
          <button
            aria-label={`Use ${label.toLowerCase()} ${index + 1}`}
            className={selectedUrl === choice.url ? "avatar-choice active" : "avatar-choice"}
            key={choice.id}
            type="button"
            onClick={() => onSelect(choice.url)}
          >
            <img src={choice.url} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="builder-review-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function parseList(value: string, maxItems: number = fieldLimits.tags): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseLines(value: string): string[] {
  return rawLines(value).slice(0, fieldLimits.exampleDialogues);
}

function rawLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function rawListItems(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listLimitError(
  value: string,
  maxItems: number,
  maxItemLength: number,
  label: string,
): string | undefined {
  const items = rawListItems(value);

  if (items.length > maxItems) {
    return `${label} can include up to ${maxItems} items.`;
  }

  if (items.some((item) => item.length > maxItemLength)) {
    return `${label} items must be ${maxItemLength} characters or less.`;
  }

  return undefined;
}

function lineLimitError(
  value: string,
  maxLines: number,
  maxLineLength: number,
  label: string,
): string | undefined {
  const lines = rawLines(value);

  if (lines.length > maxLines) {
    return `${label} can include up to ${maxLines} lines.`;
  }

  if (lines.some((line) => line.length > maxLineLength)) {
    return `${label} lines must be ${maxLineLength} characters or less.`;
  }

  return undefined;
}

function appendGeneratedChoice(
  choices: GeneratedMediaChoice[],
  choice: GeneratedMediaChoice,
): GeneratedMediaChoice[] {
  if (choices.some((item) => item.id === choice.id || item.url === choice.url)) {
    return choices;
  }

  return [...choices, choice].slice(0, maxGeneratedImageChoices);
}

function fieldKeysForStep(step: BuilderStep): FieldErrorKey[] {
  switch (step) {
    case "identity":
      return ["name", "description"];
    case "appearance":
      return [];
    case "persona":
      return [
        "personaPrompt",
        "greeting",
        "scenarioPrompt",
        "speakingStyle",
        "firstMessageStyle",
        "traitsText",
        "exampleDialoguesText",
      ];
    case "marketplace":
      return ["marketplacePreview", "tagsText", "creatorNotes", "priceDollars"];
    case "review":
      return [
        "name",
        "description",
        "personaPrompt",
        "greeting",
        "scenarioPrompt",
        "speakingStyle",
        "firstMessageStyle",
        "traitsText",
        "exampleDialoguesText",
        "marketplacePreview",
        "tagsText",
        "creatorNotes",
        "priceDollars",
      ];
  }
}

function firstStepWithError(errors: Partial<Record<FieldErrorKey, string>>): BuilderStep {
  for (const step of builderSteps) {
    if (fieldKeysForStep(step.id).some((key) => errors[key])) {
      return step.id;
    }
  }

  return "identity";
}

function composeCreatorNotes(
  notes: string,
  appearance: {
    gender: CharacterGender;
    bodyType: CharacterBodyType;
    artDirection: ImageArtDirection;
  },
): string {
  const visualNotes = `Appearance direction: ${genderLabel(appearance.gender)}, ${bodyTypeLabel(
    appearance.bodyType,
  )} body type, ${imageArtDirectionPrompt(appearance.artDirection)}.`;

  return trimGeneratedMediaText(
    [notes.trim(), visualNotes].filter(Boolean).join("\n"),
    fieldLimits.creatorNotes,
  );
}

function defaultAvatarForProfile(
  gender: CharacterGender,
  bodyType: CharacterBodyType,
  artDirection: ImageArtDirection,
  variant: number,
): string {
  const palettes = [
    {
      bg: "#050006",
      panel: "#16040d",
      accent: "#ff1f6d",
      soft: "#ff8bb7",
      hair: "#201220",
      skin: "#dfb79e",
      cloth: "#45001f",
    },
    {
      bg: "#070007",
      panel: "#1d0712",
      accent: "#f01267",
      soft: "#ffb3d0",
      hair: "#2a1429",
      skin: "#d5a68f",
      cloth: "#5c0028",
    },
    {
      bg: "#030204",
      panel: "#190711",
      accent: "#ff3f85",
      soft: "#ffd2e2",
      hair: "#26121c",
      skin: "#e6bea3",
      cloth: "#3a061f",
    },
  ];
  const palette = palettes[variant % palettes.length] ?? palettes[0]!;
  const shoulderWidth = bodyType === "athletic" || bodyType === "curvy" ? 176 : 142;
  const shoulderY = bodyType === "tall" ? 390 : 374;
  const neckWidth = bodyType === "petite" ? 40 : 54;
  const hairLength =
    gender === "female" || gender === "fluid" ? 296 : gender === "male" ? 226 : 258;
  const lineStyle = artDirection === "comic" ? "#f5f1f5" : palette.accent;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img">
  <rect width="512" height="512" fill="${palette.bg}"/>
  <circle cx="92" cy="92" r="42" fill="${palette.accent}" opacity=".28"/>
  <circle cx="418" cy="126" r="74" fill="${palette.panel}" opacity=".94"/>
  <path d="M46 416c68-34 120-46 184-34 66 12 124 4 238-42" fill="none" stroke="${palette.accent}" stroke-width="10" opacity=".32"/>
  <path d="M112 454c28-78 84-118 144-118s116 40 144 118" fill="${palette.cloth}"/>
  <path d="M${256 - shoulderWidth / 2} ${shoulderY}c42 38 96 38 132 0l36 96H120l36-96Z" fill="${palette.accent}" opacity=".78"/>
  <rect x="${256 - neckWidth / 2}" y="300" width="${neckWidth}" height="72" rx="26" fill="${palette.skin}"/>
  <path d="M146 ${hairLength}c0-95 42-158 110-158s110 63 110 158c0 48-24 88-57 112-30 21-78 21-108 0-33-24-55-64-55-112Z" fill="${palette.hair}"/>
  <ellipse cx="256" cy="248" rx="88" ry="98" fill="${palette.skin}"/>
  <path d="M171 228c22-72 72-96 151-78 32 8 57 38 61 79-52-22-117-34-212-1Z" fill="${palette.hair}"/>
  <path d="M216 258h1M296 258h1" stroke="${lineStyle}" stroke-width="16" stroke-linecap="round"/>
  <path d="M232 305c22 14 46 14 68 0" fill="none" stroke="${lineStyle}" stroke-width="9" stroke-linecap="round"/>
  <path d="M166 396c54 44 138 54 206 0" fill="none" stroke="${palette.soft}" stroke-width="7" opacity=".78"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function defaultCoverForProfile(
  category: string,
  artDirection: ImageArtDirection,
  variant: number,
): string {
  const normalized = category.toLowerCase();
  const palettes = [
    { bg: "#040004", mid: "#170711", accent: "#ff1f6d", soft: "#ffd2e2" },
    { bg: "#070007", mid: "#240918", accent: "#f01267", soft: "#ff9fca" },
    { bg: "#020203", mid: "#19050f", accent: "#ff3f85", soft: "#ffe0eb" },
  ];
  const palette = palettes[variant % palettes.length] ?? palettes[0]!;
  const hasNature = normalized.includes("comfort") || normalized.includes("fantasy");
  const hasCity = normalized.includes("drama") || normalized.includes("anime");
  const texture =
    artDirection === "painted"
      ? `<path d="M0 248c120-58 228-48 366-92 70-22 146-20 206 8v124H0Z" fill="${palette.mid}" opacity=".92"/>`
      : `<rect x="0" y="214" width="512" height="116" fill="${palette.mid}" opacity=".92"/>
         <path d="M28 42h456M28 154h456" stroke="${palette.soft}" stroke-width="1" opacity=".08"/>`;
  const scene = hasNature
    ? `<path d="M0 330c72-60 118-84 174-46 54 36 92 22 154-44 50-54 102-42 184 10v262H0Z" fill="${palette.mid}"/>
       <circle cx="396" cy="94" r="52" fill="${palette.accent}" opacity=".72"/>`
    : hasCity
      ? `<rect x="52" y="170" width="58" height="182" fill="${palette.mid}"/>
         <rect x="136" y="118" width="72" height="234" fill="${palette.mid}"/>
         <rect x="238" y="154" width="54" height="198" fill="${palette.mid}"/>
         <rect x="340" y="102" width="88" height="250" fill="${palette.mid}"/>`
      : texture;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 288" role="img">
  <rect width="512" height="288" fill="${palette.bg}"/>
  ${scene}
  <path d="M38 232c72-30 142-44 210-38 62 6 114 30 224 12" fill="none" stroke="${palette.accent}" stroke-width="8" opacity=".82"/>
  <path d="M38 246c66-18 128-24 188-18 76 8 136 34 246 18" fill="none" stroke="${palette.accent}" stroke-width="3" opacity=".42"/>
  <path d="M58 78h156M58 104h96" stroke="${palette.soft}" stroke-width="8" stroke-linecap="round" opacity=".28"/>
  <circle cx="76" cy="220" r="14" fill="${palette.accent}"/>
  <circle cx="456" cy="62" r="24" fill="${palette.accent}" opacity=".5"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function trimGeneratedMediaText(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength - 24).trimEnd();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Could not read image.")));
    reader.readAsDataURL(file);
  });
}

function generatedImagePrompt(input: {
  purpose: "character_avatar" | "character_cover";
  name: string;
  description: string;
  marketplacePreview: string;
  personaPrompt: string;
  scenarioPrompt: string;
  speakingStyle: string;
  firstMessageStyle: string;
  creatorNotes: string;
  tags: string[];
  traits: string[];
  rating: Rating;
  gender: CharacterGender;
  bodyType: CharacterBodyType;
  artDirection: ImageArtDirection;
  mood: ImageMood;
  backdrop: ImageBackdrop;
  detailLevel: ImageDetailLevel;
  hasReferenceImage: boolean;
}): string {
  const identity = input.name ? `Character: ${input.name}.` : "New Hana Chat character.";
  const tone = [
    input.description,
    input.marketplacePreview,
    input.personaPrompt,
    input.scenarioPrompt,
    input.speakingStyle,
    input.firstMessageStyle,
    input.creatorNotes,
  ]
    .filter(Boolean)
    .join(" ");
  const setting = input.scenarioPrompt || "private roleplay companion scene";
  const tags = [...input.tags, ...input.traits].slice(0, 12).join(", ");
  const backdrop =
    input.backdrop === "auto"
      ? "Backdrop should follow the scenario and persona."
      : `Backdrop: ${imageBackdropPrompt(input.backdrop)}.`;
  const mood =
    input.mood === "auto"
      ? "Mood should follow the character persona."
      : `Mood: ${imageMoodPrompt(input.mood)}.`;
  const safety =
    input.rating === "adult" || input.rating === "mature"
      ? "fictional adult character, mature mood, non-explicit promotional art"
      : "non-explicit, age-appropriate promotional art";
  const framing =
    input.purpose === "character_avatar"
      ? "portrait avatar with a clear face and memorable silhouette"
      : "wide cover image with environment, mood, and cinematic space";
  const appearance = `Appearance direction: ${genderLabel(input.gender)}, ${bodyTypeLabel(
    input.bodyType,
  )} body type.`;

  return [
    identity,
    framing,
    safety,
    appearance,
    tags ? `Tags and traits: ${tags}.` : "",
    `Scene/world: ${setting}.`,
    `Art direction: ${imageArtDirectionPrompt(input.artDirection)}.`,
    mood,
    backdrop,
    `Finish level: ${imageDetailPrompt(input.detailLevel)}.`,
    "Color palette: follow the character, outfit, setting, and selected mood. Do not force Hana brand colors, hotpink, magenta, or neon accents unless the creator explicitly chose or wrote them.",
    input.hasReferenceImage
      ? "Reference: use the attached selected profile image as the character identity reference. Preserve the face, hair, build, outfit direction, and recognizable persona while expanding into a cover scene."
      : "",
    `Personality and visual mood: ${tone || "expressive fictional character companion"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function imageStyleForCharacter(input: {
  artDirection: ImageArtDirection;
  mood: ImageMood;
  backdrop: ImageBackdrop;
  detailLevel: ImageDetailLevel;
  rating: Rating;
  gender: CharacterGender;
  bodyType: CharacterBodyType;
  tags: string[];
  category: string;
}): string {
  const normalized = `${input.category} ${input.tags.join(" ")}`.toLowerCase();
  const artDirection = imageArtDirectionPrompt(input.artDirection);
  const mood = input.mood === "auto" ? inferredMoodPrompt(input) : imageMoodPrompt(input.mood);
  const backdrop =
    input.backdrop === "auto" ? inferredBackdropPrompt(input) : imageBackdropPrompt(input.backdrop);
  const detail = imageDetailPrompt(input.detailLevel);

  return [
    artDirection,
    mood,
    backdrop,
    detail,
    `${genderLabel(input.gender)}, ${bodyTypeLabel(input.bodyType)} body direction`,
    normalized.includes("fantasy") ? "worldbuilding-friendly visual detail" : "",
    input.rating === "adult" || input.rating === "mature"
      ? "mature fictional character styling, elegant non-explicit composition"
      : "non-explicit character-safe composition",
    "readable on a dark app surface without forced brand colors",
  ]
    .filter(Boolean)
    .join(", ");
}

function imageArtDirectionPrompt(value: ImageArtDirection): string {
  switch (value) {
    case "anime":
      return "premium anime and visual novel art";
    case "semi_real":
      return "semi-realistic fictional character illustration";
    case "cinematic":
      return "cinematic stylized realism, fictional person only";
    case "editorial":
      return "fashion editorial character art";
    case "painted":
      return "painterly digital character art";
    case "comic":
      return "graphic novel and comic cover art";
    case "soft_3d":
      return "soft 3D character render with polished materials";
  }
}

function imageMoodPrompt(value: ImageMood): string {
  switch (value) {
    case "auto":
      return "persona-led mood";
    case "soft":
      return "soft intimate light";
    case "dramatic":
      return "dramatic cinematic contrast";
    case "neon":
      return "neon nightlife accents";
    case "cozy":
      return "cozy warm atmosphere";
    case "dark":
      return "dark mysterious mood";
    case "spicy":
      return "suggestive mature tension, still fully clothed and non-explicit";
    case "fantasy":
      return "fantasy atmosphere with magical depth";
  }
}

function imageBackdropPrompt(value: ImageBackdrop): string {
  switch (value) {
    case "auto":
      return "scenario-led backdrop";
    case "studio":
      return "clean studio backdrop";
    case "city":
      return "city street or skyline backdrop";
    case "nature":
      return "nature landscape, garden, forest, or open sky";
    case "cafe":
      return "cafe or lounge interior";
    case "bedroom":
      return "private room interior with tasteful atmosphere";
    case "fantasy":
      return "fantasy world backdrop";
    case "nightlife":
      return "nightlife or club-lit backdrop";
  }
}

function imageDetailPrompt(value: ImageDetailLevel): string {
  switch (value) {
    case "clean":
      return "clean readable shapes, minimal clutter";
    case "balanced":
      return "balanced detail and readable composition";
    case "rich":
      return "rich detail, textured lighting, premium finish";
  }
}

function inferredMoodPrompt(input: { rating: Rating; tags: string[]; category: string }): string {
  const normalized = `${input.category} ${input.tags.join(" ")}`.toLowerCase();

  if (
    normalized.includes("neon") ||
    normalized.includes("nightlife") ||
    normalized.includes("club")
  ) {
    return imageMoodPrompt("neon");
  }

  if (normalized.includes("cyber") || normalized.includes("city")) {
    return imageMoodPrompt("dramatic");
  }

  if (normalized.includes("comfort") || normalized.includes("teacher")) {
    return imageMoodPrompt("cozy");
  }

  if (normalized.includes("fantasy")) {
    return imageMoodPrompt("fantasy");
  }

  if (input.rating === "adult" || input.rating === "mature") {
    return imageMoodPrompt("spicy");
  }

  return imageMoodPrompt("soft");
}

function inferredBackdropPrompt(input: { tags: string[]; category: string }): string {
  const normalized = `${input.category} ${input.tags.join(" ")}`.toLowerCase();

  if (normalized.includes("fantasy")) {
    return imageBackdropPrompt("fantasy");
  }

  if (normalized.includes("nightlife") || normalized.includes("club")) {
    return imageBackdropPrompt("nightlife");
  }

  if (normalized.includes("city") || normalized.includes("cyber")) {
    return imageBackdropPrompt("city");
  }

  if (normalized.includes("nature")) {
    return imageBackdropPrompt("nature");
  }

  if (normalized.includes("maid") || normalized.includes("cafe")) {
    return imageBackdropPrompt("cafe");
  }

  return imageBackdropPrompt("studio");
}

function isGeneratedOrUploadedMediaUrl(value: string): boolean {
  return /^\/api\/v1\/media\/[A-Za-z0-9-]+\/file(?:[?#].*)?$/.test(value);
}

function genderLabel(value: CharacterGender): string {
  switch (value) {
    case "female":
      return "Female";
    case "male":
      return "Male";
    case "nonbinary":
      return "Nonbinary";
    case "fluid":
      return "Fluid";
    case "unspecified":
      return "Open gender";
  }
}

function bodyTypeLabel(value: CharacterBodyType): string {
  switch (value) {
    case "slim":
      return "Slim";
    case "athletic":
      return "Athletic";
    case "curvy":
      return "Curvy";
    case "soft":
      return "Soft";
    case "tall":
      return "Tall";
    case "petite":
      return "Petite";
  }
}

function genderForTemplate(template: CharacterTemplate): CharacterGender {
  if (template.category === "romance") {
    return "female";
  }

  if (template.category === "drama") {
    return "unspecified";
  }

  if (template.category === "comfort") {
    return "nonbinary";
  }

  return "unspecified";
}

function bodyTypeForTemplate(template: CharacterTemplate): CharacterBodyType {
  if (template.category === "drama") {
    return "athletic";
  }

  if (template.category === "fantasy") {
    return "tall";
  }

  if (template.category === "romance") {
    return "soft";
  }

  return defaultBuilderBodyType;
}

function imageArtDirectionForTemplate(template: CharacterTemplate): ImageArtDirection {
  if (template.category === "fantasy") {
    return "painted";
  }

  if (template.category === "drama") {
    return "cinematic";
  }

  if (template.category === "comfort") {
    return "semi_real";
  }

  return "anime";
}

function imageMoodForTemplate(template: CharacterTemplate): ImageMood {
  if (template.category === "fantasy") {
    return "fantasy";
  }

  if (template.category === "drama") {
    return "dramatic";
  }

  if (template.category === "comfort") {
    return "cozy";
  }

  return "soft";
}
