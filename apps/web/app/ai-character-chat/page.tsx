import { PublicTopicPage } from "../public-topic-page";
import { createPublicMetadata } from "../seo";

export const metadata = createPublicMetadata("/ai-character-chat");

const sections = [
  {
    title: "Character-first chat",
    body: "Hana starts from the character's persona, greeting, public description, tags, and room history so replies stay tied to who the character is supposed to be.",
  },
  {
    title: "Memory that stays in the room",
    body: "Memories are scoped to the current user, character, and conversation. A comfort room, rivalry room, and fantasy room can evolve differently without mixing context.",
  },
  {
    title: "Fast path from discovery to chat",
    body: "Discover cards lead directly into fresh rooms, while existing rooms stay available for people who want to continue an older thread.",
  },
];

export default function AiCharacterChatPage() {
  return (
    <PublicTopicPage
      path="/ai-character-chat"
      eyebrow="AI character chat"
      headline="Chat with AI characters that keep the thread alive."
      intro="Hana Chat is built for people who want a character to remember the room, react to the current scene, and feel consistent across return visits."
      bullets={sections.map((section) => section.title)}
      sections={sections}
      faqs={[
        {
          question: "How is Hana different from a generic chatbot?",
          answer:
            "Hana puts the character, room history, memory, and relationship continuity at the center instead of treating each message like a fresh support chat.",
        },
        {
          question: "Can one character have multiple chats?",
          answer:
            "Yes. You can keep multiple rooms with the same character, and each room keeps its own history and memory.",
        },
        {
          question: "Do public characters appear in discovery?",
          answer:
            "Approved public characters can appear in Discover with their profile image, tags, rating, creator, and chat entry point.",
        },
      ]}
    />
  );
}
