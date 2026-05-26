"use client";

import {
  Camera,
  ChevronsUp,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Tags,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PremiumSelect } from "../../components/premium-select";
import { apiJson, money } from "../api";
import { renderRoleplayPreview } from "../roleplay-preview";

type Rating = "general" | "teen" | "mature" | "adult";
type ModelProfile = "fast" | "balanced" | "immersive" | "premium";

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

const avatarChoices = [
  "/assets/hana-icon-head.png",
  "/assets/hana-icon-192.png",
  "/assets/hana-mascot.png",
];
const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const maxClientUploadBytes = 5 * 1024 * 1024;
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [scenarioPrompt, setScenarioPrompt] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [firstMessageStyle, setFirstMessageStyle] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [greeting, setGreeting] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(avatarChoices[0] ?? "/assets/hana-icon-head.png");
  const [coverImageUrl, setCoverImageUrl] = useState("/assets/hana-hero.png");
  const [templateId, setTemplateId] = useState("blank");
  const [marketplaceCategory, setMarketplaceCategory] = useState("romance");
  const [marketplacePreview, setMarketplacePreview] = useState("");
  const [tagsText, setTagsText] = useState("anime, romance, memory");
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void loadCharacters();
  }, []);

  const previewTags = useMemo(() => parseList(tagsText).slice(0, 4), [tagsText]);
  const previewTraits = useMemo(() => parseList(traitsText).slice(0, 4), [traitsText]);

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

  function applyTemplate(template: CharacterTemplate) {
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
    setStatus(`${template.name} template applied.`);
  }

  async function saveCharacter() {
    setIsSubmitting(true);
    setStatus("Saving character...");

    try {
      await apiJson<{ id: string }>("/api/v1/characters", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          personaPrompt,
          scenarioPrompt,
          firstMessageStyle,
          creatorNotes,
          speakingStyle,
          personalityTraits: parseList(traitsText),
          exampleDialogues: parseLines(exampleDialoguesText),
          avatarUrl,
          coverImageUrl,
          templateId,
          marketplaceCategory,
          marketplacePreview,
          modelProfile,
          greeting,
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
        setAvatarUploadStatus("Profile image uploaded.");
      } else {
        setCoverImageUrl(media.url);
        setCoverUploadStatus("Cover image uploaded.");
      }
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Upload failed.");
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
        onSubmit={(event) => {
          event.preventDefault();
          void saveCharacter();
        }}
      >
        <div className="form-section-title">
          <Camera size={18} />
          <div>
            <h2>Profile</h2>
            <p>What people see before they open a chat.</p>
          </div>
        </div>

        <div className="builder-media-grid">
          <div className="avatar-picker">
            <img src={avatarUrl} alt="Character avatar preview" />
            <label className="media-upload-button">
              <UploadCloud size={16} />
              Upload profile image
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
            <p className="upload-status" aria-live="polite">
              {avatarUploadStatus}
            </p>
            <div className="avatar-choice-row">
              {avatarChoices.map((choice) => (
                <button
                  aria-label={`Use avatar ${choice}`}
                  className={avatarUrl === choice ? "avatar-choice active" : "avatar-choice"}
                  key={choice}
                  type="button"
                  onClick={() => setAvatarUrl(choice)}
                >
                  <img src={choice} alt="" />
                </button>
              ))}
            </div>
          </div>
          <div className="builder-field-stack">
            <label>
              Character name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <div className="cover-upload-card">
              <div className="cover-upload-preview">
                <img src={coverImageUrl} alt="Character cover preview" />
              </div>
              <label className="media-upload-button wide">
                <UploadCloud size={16} />
                Upload cover image
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
              <p className="upload-status" aria-live="polite">
                {coverUploadStatus}
              </p>
            </div>
          </div>
        </div>

        <div className="form-section-title">
          <Wand2 size={18} />
          <div>
            <h2>Persona</h2>
            <p>Define the character, speaking style, opening scene, and continuity style.</p>
          </div>
        </div>

        <label>
          Marketplace description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            required
          />
        </label>
        <label>
          Core persona
          <textarea
            value={personaPrompt}
            onChange={(event) => setPersonaPrompt(event.target.value)}
            rows={7}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Scenario
            <textarea
              value={scenarioPrompt}
              onChange={(event) => setScenarioPrompt(event.target.value)}
              rows={4}
            />
          </label>
          <label>
            Speaking style
            <textarea
              value={speakingStyle}
              onChange={(event) => setSpeakingStyle(event.target.value)}
              rows={4}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            First message style
            <input
              value={firstMessageStyle}
              onChange={(event) => setFirstMessageStyle(event.target.value)}
            />
          </label>
          <label>
            Personality traits
            <input value={traitsText} onChange={(event) => setTraitsText(event.target.value)} />
          </label>
        </div>
        <label>
          Greeting
          <textarea
            value={greeting}
            onChange={(event) => setGreeting(event.target.value)}
            rows={4}
            required
          />
        </label>
        <label>
          Example dialogue lines
          <textarea
            value={exampleDialoguesText}
            onChange={(event) => setExampleDialoguesText(event.target.value)}
            rows={4}
          />
        </label>

        <div className="form-section-title">
          <Tags size={18} />
          <div>
            <h2>Marketplace</h2>
            <p>Package the character for discovery, ranking, and paid access.</p>
          </div>
        </div>

        <div className="form-grid">
          <PremiumSelect
            label="Category"
            value={marketplaceCategory}
            options={categoryOptions}
            onChange={setMarketplaceCategory}
          />
          <PremiumSelect
            label="Rating"
            value={rating}
            options={ratingOptions}
            onChange={setRating}
          />
        </div>
        <label>
          Tags
          <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
        </label>
        <label>
          Preview line
          <input
            value={marketplacePreview}
            onChange={(event) => setMarketplacePreview(event.target.value)}
          />
        </label>

        <div className="form-section-title">
          <ChevronsUp size={18} />
          <div>
            <h2>Tuning</h2>
            <p>Choose the response feel and how the character is sold.</p>
          </div>
        </div>

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
        <div className="form-grid">
          <label>
            Paid price
            <input
              min={0}
              max={99.99}
              step={0.99}
              type="number"
              value={priceDollars}
              onChange={(event) => setPriceDollars(Number(event.target.value))}
              disabled={!monetizationAvailable}
            />
          </label>
          <label>
            Creator notes
            <input value={creatorNotes} onChange={(event) => setCreatorNotes(event.target.value)} />
          </label>
        </div>
        <label className="toggle-row">
          <input
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
            type="checkbox"
          />
          Save as private draft
        </label>
        <label className="toggle-row">
          <input
            checked={monetizationAvailable && monetizationEnabled}
            onChange={(event) => setMonetizationEnabled(event.target.checked)}
            disabled={!monetizationAvailable}
            type="checkbox"
          />
          {monetizationAvailable ? "Enable paid access" : "Paid access coming soon"}
        </label>
        <button className="primary-action full-width" type="submit" disabled={isSubmitting}>
          <Plus size={18} /> Save character
        </button>
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

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
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
