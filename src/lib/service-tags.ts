export const SERVICE_TAGS = [
  { value: "common", label: "Common", description: "Shared foundational information used across your estate plan." },
  { value: "will", label: "Will", description: "Directs how your property is distributed and names guardians for minor children." },
  { value: "trust", label: "Trust", description: "Holds assets for beneficiaries and can help avoid probate." },
  { value: "poa", label: "POA", description: "Power of Attorney — lets someone you trust manage financial matters if you can't." },
  { value: "healthcare", label: "Healthcare", description: "Healthcare directive naming who can make medical decisions and outlining your care wishes." },
] as const;

export type ServiceTag = (typeof SERVICE_TAGS)[number]["value"];

/** Extra document types selectable by members but not part of the core DB enum. */
export const EXTRA_DOCS = [
  { value: "revocable_trust", label: "Revocable Trust", description: "A living trust you can change or revoke during your lifetime; helps avoid probate on titled assets." },
] as const;

const EXTRA_LABELS: Record<string, string> = Object.fromEntries(
  EXTRA_DOCS.map((d) => [d.value, d.label]),
);

const DESCRIPTIONS: Record<string, string> = {
  ...Object.fromEntries(SERVICE_TAGS.map((s) => [s.value, s.description])),
  ...Object.fromEntries(EXTRA_DOCS.map((d) => [d.value, d.description])),
};

export const tagLabel = (t: string) =>
  SERVICE_TAGS.find((x) => x.value === t)?.label ?? EXTRA_LABELS[t] ?? t;

export const tagDescription = (t: string): string | undefined => DESCRIPTIONS[t];


