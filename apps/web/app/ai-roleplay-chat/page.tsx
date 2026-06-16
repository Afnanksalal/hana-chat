import { PublicTopicPage } from "../public-topic-page";
import { createPublicMetadata } from "../seo";

export const metadata = createPublicMetadata("/ai-roleplay-chat");

const sections = [
  {
    title: "Scenes continue",
    body: "Roleplay works better when the character remembers where the scene is, what was promised, which conflicts are unresolved, and what tone the user chose.",
  },
  {
    title: "Actions should vary",
    body: "Hana uses recent messages, scene state, and character style to avoid repeating the same action beat when a room is supposed to feel alive.",
  },
  {
    title: "Mature spaces stay opt-in",
    body: "Romantic and mature roleplay signals come from the character, tags, rating, user settings, and access rules instead of making every bot behave the same way.",
  },
];

export default function AiRoleplayChatPage() {
  return (
    <PublicTopicPage
      path="/ai-roleplay-chat"
      eyebrow="AI roleplay chat"
      headline="Private AI roleplay that remembers the scene."
      intro="Create comfort chats, romance, rivalries, fantasy arcs, slow-burn stories, and creator-made scenarios with continuity that follows the room."
      bullets={sections.map((section) => section.title)}
      sections={sections}
      faqs={[
        {
          question: "Can Hana support long-running roleplay?",
          answer:
            "Yes. Hana is designed around persistent rooms, recent history, scoped memory, and evolving relationship state for longer stories.",
        },
        {
          question: "Does roleplay memory apply to every character?",
          answer:
            "No. Memory is scoped per user, per character, and per conversation so one story does not leak into another.",
        },
        {
          question: "Are mature roleplay spaces public by default?",
          answer:
            "No. Mature spaces are controlled through rating, review, user settings, and eligibility rules.",
        },
      ]}
    />
  );
}
