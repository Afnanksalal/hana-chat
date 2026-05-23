export type SafetyStage = "input" | "output" | "character" | "memory";

export type SafetyAction = "allow" | "transform" | "block" | "escalate" | "shadow_limit";

export type SafetyCategory =
  | "adult_content"
  | "minor_safety"
  | "real_person_sexualization"
  | "non_consensual_intimate_content"
  | "self_harm"
  | "violence"
  | "harassment"
  | "spam"
  | "prompt_injection"
  | "credential_leakage"
  | "system_prompt_extraction"
  | "architecture_disclosure"
  | "code_execution"
  | "jailbreak"
  | "tool_abuse"
  | "data_exfiltration"
  | "model_abuse";

export interface SafetyDecision {
  id: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  stage: SafetyStage;
  policyVersion: string;
  action: SafetyAction;
  categories: SafetyCategory[];
  confidence: number;
  reasonCode: string;
  createdAt: string;
}

export interface SafetyContext {
  adultModeEnabled: boolean;
  userIsAdult: boolean;
  characterRating: "general" | "teen" | "mature" | "adult";
}

const policyVersion = "safety-v2";

interface RuleHit {
  category: SafetyCategory;
  reasonCode: string;
  confidence: number;
}

interface PatternRule extends RuleHit {
  patterns: RegExp[];
}

const promptInjectionPatterns = [
  /\b(ignore|forget|override|discard|bypass)\b.{0,80}\b(previous|prior|above|system|developer|safety|policy|instructions)\b/i,
  /\breveal\b.{0,80}\b(system|developer|hidden|internal|safety|policy|prompt|instructions|rules)\b/i,
  /\bprint\b.{0,80}\b(hidden|system|developer|internal|safety|policy|prompt|instructions|rules)\b/i,
  /\byou are now\b.{0,40}\b(developer mode|admin mode|unfiltered|uncensored|jailbroken)\b/i,
  /\b(DAN|do anything now|jailbreak|prompt injection|roleplay as an unrestricted)\b/i,
  /\bno restrictions\b|\bwithout safety\b|\bdisable (all )?(filters|guardrails|moderation|policy)\b/i,
];

const credentialPatterns = [
  /api[_-]?key\s*[:=]/i,
  /bearer\s+[a-z0-9._-]{20,}/i,
  /password\s*[:=]\s*\S+/i,
  /\b(session|access|refresh)[_-]?token\s*[:=]/i,
  /\b(private|secret)[_-]?key\s*[:=]/i,
  /\.env\b/i,
];

const architectureDisclosurePatterns = [
  /\b(what|which|show|tell|explain|describe)\b.{0,80}\b(model|provider|llm|backend|database|vector db|architecture|infra|infrastructure|orchestrator|gateway|source code|repo)\b/i,
  /\b(xai|grok|qdrant|neo4j|postgres|redis|redpanda|clickhouse|temporal|docker|kubernetes|nestjs|vercel)\b/i,
  /\b(system design|deployment topology|internal service|microservice|environment variable)\b/i,
];

const codeExecutionPatterns = [
  /\b(run|execute|eval|compile|spawn|shell out|open a terminal|use terminal)\b.{0,80}\b(code|command|script|shell|cmd|powershell|bash|python|node|curl|wget|npm|pnpm)\b/i,
  /\b(read|write|delete|modify|upload|download)\b.{0,80}\b(file|folder|directory|repo|source|filesystem)\b/i,
  /\b(cat|type|get-content|rm -rf|del |subprocess|child_process|exec\(|eval\(|Function\()\b/i,
  /\b\/etc\/passwd\b|\bC:\\Users\\|\b\.ssh\/|id_rsa/i,
];

const dataExfiltrationPatterns = [
  /\b(show|print|dump|leak|exfiltrate|export|list)\b.{0,80}\b(secret|token|api key|password|cookie|session|credential|private data|memory database)\b/i,
  /\b(show|print|dump|list)\b.{0,80}\b(all memories|hidden memories|other users|database rows|logs)\b/i,
];

const outputLeakagePatterns = [
  /\bknown memories from this chat\b/i,
  /\bno durable memories for this chat yet\b/i,
  /\b(system|developer|hidden|internal) prompt\b/i,
  /\bpersona_prompt\b|\braw prompt\b|\bhidden instructions\b/i,
  /\b(xai|grok|qdrant|neo4j|postgres|redis|redpanda|clickhouse|temporal|api gateway|docker compose|environment variable)\b/i,
  /\bapi[_-]?key\b|\bbearer token\b|\bsession token\b|\bprivate key\b/i,
];

const inputRules: PatternRule[] = [
  {
    category: "credential_leakage",
    reasonCode: "credential_leakage_detected",
    confidence: 0.98,
    patterns: credentialPatterns,
  },
  {
    category: "system_prompt_extraction",
    reasonCode: "system_prompt_extraction_detected",
    confidence: 0.96,
    patterns: [
      /\b(system|developer|hidden|internal|safety|policy)\b.{0,80}\b(prompt|message|instruction|rule|contract)\b/i,
      /\bmemory block\b|\bknown memories\b|\bshow your chain of thought\b/i,
    ],
  },
  {
    category: "prompt_injection",
    reasonCode: "prompt_injection_detected",
    confidence: 0.94,
    patterns: promptInjectionPatterns,
  },
  {
    category: "architecture_disclosure",
    reasonCode: "architecture_disclosure_detected",
    confidence: 0.9,
    patterns: architectureDisclosurePatterns,
  },
  {
    category: "code_execution",
    reasonCode: "code_execution_detected",
    confidence: 0.92,
    patterns: codeExecutionPatterns,
  },
  {
    category: "data_exfiltration",
    reasonCode: "data_exfiltration_detected",
    confidence: 0.95,
    patterns: dataExfiltrationPatterns,
  },
  {
    category: "jailbreak",
    reasonCode: "jailbreak_detected",
    confidence: 0.94,
    patterns: [/\bjailbreak\b/i, /\buncensored mode\b/i, /\bdeveloper mode\b/i],
  },
  {
    category: "tool_abuse",
    reasonCode: "tool_abuse_detected",
    confidence: 0.88,
    patterns: [
      /\b(call|invoke|use)\b.{0,50}\b(tool|function|plugin|connector|browser|filesystem|database)\b/i,
      /\bmake an API request\b|\bquery the database\b|\bexecute sql\b/i,
    ],
  },
];

const outputRules: PatternRule[] = [
  {
    category: "data_exfiltration",
    reasonCode: "unsafe_output_internal_disclosure",
    confidence: 0.96,
    patterns: outputLeakagePatterns,
  },
  {
    category: "architecture_disclosure",
    reasonCode: "unsafe_output_architecture_disclosure",
    confidence: 0.92,
    patterns: architectureDisclosurePatterns,
  },
  {
    category: "code_execution",
    reasonCode: "unsafe_output_code_execution_claim",
    confidence: 0.88,
    patterns: [
      /\bI (ran|executed|opened|read|wrote|deleted)\b.{0,80}\b(file|command|terminal|database|source code)\b/i,
    ],
  },
];

export function classifyTextSafety(
  text: string,
  context: SafetyContext,
): Omit<SafetyDecision, "id" | "userId" | "createdAt"> {
  const hits = collectRuleHits(text, inputRules);
  const categories = new Set<SafetyCategory>(hits.map((hit) => hit.category));

  if (!context.userIsAdult && context.adultModeEnabled) {
    categories.add("minor_safety");
    hits.push({
      category: "minor_safety",
      reasonCode: "minor_adult_mode_detected",
      confidence: 0.98,
    });
  }

  if (
    (context.characterRating === "adult" || context.characterRating === "mature") &&
    (!context.userIsAdult || !context.adultModeEnabled)
  ) {
    categories.add("adult_content");
    hits.push({
      category: "adult_content",
      reasonCode: "adult_mode_not_enabled",
      confidence: 0.9,
    });
  }

  const categoryList = Array.from(categories);

  if (categoryList.length > 0) {
    const primaryHit = hits.sort((left, right) => right.confidence - left.confidence)[0];

    return {
      stage: "input",
      policyVersion,
      action: "block",
      categories: categoryList,
      confidence: primaryHit?.confidence ?? 0.9,
      reasonCode: primaryHit?.reasonCode ?? "hard_safety_gate",
    };
  }

  return {
    stage: "input",
    policyVersion,
    action: "allow",
    categories: categoryList,
    confidence: 0.5,
    reasonCode: "no_rule_match",
  };
}

export function classifyModelOutputSafety(
  text: string,
): Omit<SafetyDecision, "id" | "userId" | "createdAt"> {
  const hits = collectRuleHits(text, outputRules);
  const categories = Array.from(new Set<SafetyCategory>(hits.map((hit) => hit.category)));

  if (categories.length > 0) {
    const primaryHit = hits.sort((left, right) => right.confidence - left.confidence)[0];

    return {
      stage: "output",
      policyVersion,
      action: "block",
      categories,
      confidence: primaryHit?.confidence ?? 0.9,
      reasonCode: primaryHit?.reasonCode ?? "unsafe_output_detected",
    };
  }

  return {
    stage: "output",
    policyVersion,
    action: "allow",
    categories,
    confidence: 0.5,
    reasonCode: "no_rule_match",
  };
}

function collectRuleHits(text: string, rules: PatternRule[]): RuleHit[] {
  return rules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map(({ category, reasonCode, confidence }) => ({ category, reasonCode, confidence }));
}
