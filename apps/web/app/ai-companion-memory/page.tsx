import { PublicTopicPage } from "../public-topic-page";
import { createPublicMetadata } from "../seo";

export const metadata = createPublicMetadata("/ai-companion-memory");

const sections = [
  {
    title: "Scoped continuity",
    body: "Hana keeps prompt memory tied to one user, one character, and one conversation so each room can grow its own continuity.",
  },
  {
    title: "Useful memories, not noise",
    body: "Memory is meant for names, preferences, boundaries, relationship state, scene facts, and recurring choices that make future replies better.",
  },
  {
    title: "Evolution needs evidence",
    body: "A character should not jump from enemy to lover after one kind message. Relationship state should move from what the chat actually earns.",
  },
];

export default function AiCompanionMemoryPage() {
  return (
    <PublicTopicPage
      path="/ai-companion-memory"
      eyebrow="AI companion memory"
      headline="AI companion memory that respects the room."
      intro="Hana Chat treats memory as continuity, not trivia. Each character room can remember what matters without leaking another story into the prompt."
      bullets={sections.map((section) => section.title)}
      sections={sections}
      faqs={[
        {
          question: "What does Hana remember?",
          answer:
            "Hana can remember useful personal details, preferences, boundaries, relationship cues, scene state, and story continuity inside a specific room.",
        },
        {
          question: "Can users manage memories?",
          answer:
            "Yes. Memory controls are part of the chat settings surface so users can view, add, remove, or turn memory behavior off.",
        },
        {
          question: "Does memory cross between rooms?",
          answer: "No. Hana's memory contract is per user, per character, and per conversation.",
        },
      ]}
    />
  );
}
