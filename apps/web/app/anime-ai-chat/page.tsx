import { PublicTopicPage } from "../public-topic-page";
import { createPublicMetadata } from "../seo";

export const metadata = createPublicMetadata("/anime-ai-chat");

const sections = [
  {
    title: "Anime-inspired companions",
    body: "Hana supports anime-inspired character art, expressive personas, comfort chats, romance, fantasy scenes, study partners, and original creator worlds.",
  },
  {
    title: "Not one visual style",
    body: "Creators can steer body type, fashion, setting, mood, and art direction instead of forcing every character into the same pink neon look.",
  },
  {
    title: "Discovery stays image-led",
    body: "Profile images, cover images, tags, ratings, and creator labels help people understand a character before starting a room.",
  },
];

export default function AnimeAiChatPage() {
  return (
    <PublicTopicPage
      path="/anime-ai-chat"
      eyebrow="Anime AI chat"
      headline="Anime AI chat characters with actual personality."
      intro="Discover and create anime-inspired AI characters that carry more than a profile picture: persona, scene, style, tags, and memory all shape the chat."
      bullets={sections.map((section) => section.title)}
      sections={sections}
      faqs={[
        {
          question: "Is Hana only anime?",
          answer:
            "No. Anime-inspired characters are a major style, but Hana also supports fantasy, comfort, study, fitness, mystery, romance, and original personas.",
        },
        {
          question: "Can creators generate character images?",
          answer:
            "Yes. Creator Studio supports profile and cover media generation with selectable options and uploaded references.",
        },
        {
          question: "Do tags affect the character?",
          answer:
            "Tags help discovery and also describe the intended style, category, rating, and roleplay direction for a character.",
        },
      ]}
    />
  );
}
