// Appendix A — industry-standard decision dimensions used by the
// template-selection rule builder. Each field maps to a key on a
// sample member profile object.

export type FieldType = "enum" | "bool" | "multi";

export type RuleField = {
  key: string;
  label: string;
  hint?: string;
  type: FieldType;
  options?: { value: string; label: string }[];
};

const US_STATES: { value: string; label: string }[] = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"],
].map(([value, label]) => ({ value, label }));

export const RULE_FIELDS: RuleField[] = [
  {
    key: "document_type",
    label: "Document type",
    hint: "Primary service the member is completing.",
    type: "enum",
    options: [
      { value: "will", label: "Will" },
      { value: "trust", label: "Revocable trust" },
      { value: "poa", label: "Power of attorney" },
      { value: "healthcare", label: "Healthcare directive" },
      { value: "bundle", label: "Bundle" },
    ],
  },
  {
    key: "state",
    label: "State / jurisdiction",
    hint: "Biggest driver — witnessing, notarization and statutory forms differ by state.",
    type: "enum",
    options: US_STATES,
  },
  {
    key: "marital_status",
    label: "Marital status",
    type: "enum",
    options: [
      { value: "single", label: "Single" },
      { value: "married", label: "Married" },
      { value: "partnered", label: "Partnered" },
      { value: "divorced", label: "Divorced" },
      { value: "widowed", label: "Widowed" },
    ],
  },
  {
    key: "has_real_estate",
    label: "Owns real estate",
    hint: "Drives revocable trust + pour-over will variants.",
    type: "bool",
  },
  {
    key: "has_minor_children",
    label: "Has minor children",
    hint: "Guardianship / minor sub-trust provisions.",
    type: "bool",
  },
  {
    key: "probate_avoidance",
    label: "Probate-avoidance goal",
    type: "bool",
  },
  {
    key: "estate_size",
    label: "Estate size / complexity",
    type: "enum",
    options: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
      { value: "complex", label: "Complex (tax planning)" },
    ],
  },
  {
    key: "poa_type",
    label: "POA type",
    type: "enum",
    options: [
      { value: "durable", label: "Durable" },
      { value: "springing", label: "Springing" },
      { value: "statutory", label: "Statutory form" },
      { value: "custom", label: "Custom" },
    ],
  },
  {
    key: "healthcare_form_type",
    label: "Healthcare form type",
    type: "enum",
    options: [
      { value: "living_will", label: "Living will" },
      { value: "proxy", label: "Healthcare proxy / agent" },
      { value: "combined", label: "Combined advance directive" },
      { value: "state_statutory", label: "State statutory form" },
    ],
  },
  {
    key: "beneficiary_structure",
    label: "Beneficiary structure",
    type: "enum",
    options: [
      { value: "outright", label: "Outright" },
      { value: "in_trust", label: "In trust" },
      { value: "staggered", label: "Staggered ages" },
      { value: "spendthrift", label: "Spendthrift" },
    ],
  },
  {
    key: "bundle_composition",
    label: "Bundle includes",
    hint: "Bundle members: which documents are included.",
    type: "multi",
    options: [
      { value: "will", label: "Will" },
      { value: "trust", label: "Trust" },
      { value: "poa", label: "POA" },
      { value: "healthcare", label: "Healthcare" },
    ],
  },
  {
    key: "language",
    label: "Language / accessibility",
    type: "enum",
    options: [
      { value: "en", label: "English" },
      { value: "es", label: "Spanish" },
      { value: "plain_language", label: "Plain language" },
    ],
  },
];

export const RULE_FIELD_MAP = Object.fromEntries(RULE_FIELDS.map((f) => [f.key, f]));
