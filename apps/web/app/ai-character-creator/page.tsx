import { PublicTopicPage } from "../public-topic-page";
import { createPublicMetadata } from "../seo";

export const metadata = createPublicMetadata("/ai-character-creator");

const sections = [
  {
    title: "Identity before polish",
    body: "The builder starts with name, pitch, gender direction, and core premise before asking for visual styling or marketplace packaging.",
  },
  {
    title: "Persona drives behavior",
    body: "Description, persona, opening scene, style notes, tags, rating, and examples all help the model understand how the character should act.",
  },
  {
    title: "Publish with controls",
    body: "Creators can keep drafts private, package public listings, and use rating/review controls for mature or adult characters.",
  },
];

export default function AiCharacterCreatorPage() {
  return (
    <PublicTopicPage
      path="/ai-character-creator"
      eyebrow="AI character creator"
      headline="Create AI characters with persona, art, and memory-ready context."
      intro="Hana's creator flow is made for original companions, not blank bots. Build the identity, tune the scene, choose visuals, and package the listing."
      bullets={sections.map((section) => section.title)}
      sections={sections}
      faqs={[
        {
          question: "What can creators define?",
          answer:
            "Creators can define profile image, cover image, name, description, category, tags, rating, persona, scenario, greeting, style, and publishing state.",
        },
        {
          question: "Can characters stay private?",
          answer:
            "Yes. Draft and private characters can stay out of public discovery until the creator is ready to publish.",
        },
        {
          question: "Can image generation use a selected profile reference?",
          answer:
            "Yes. Cover generation can use the selected uploaded or generated profile image as an identity reference.",
        },
      ]}
    />
  );
}
