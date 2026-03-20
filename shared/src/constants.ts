export const ATTRIBUTE_KEYS = [
  "region",
  "country",
  "continent",
  "gender",
  "ageRange",
  "educationLevel",
  "occupation",
  "incomeRange",
  "interests",
  "maritalStatus",
  "customTags",
  "noise",
] as const;

export const RUN_STAGES = ["identity", "persona", "response"] as const;

export const QUESTION_TYPES = [
  "single_choice",
  "multi_choice",
  "single_choice_other",
  "multi_choice_other",
  "rating",
  "open_text",
  "paragraph",
  "section_title",
  "respondent_instruction",
] as const;
