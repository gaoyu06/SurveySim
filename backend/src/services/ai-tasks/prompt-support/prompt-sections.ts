export interface PromptSection {
  title?: string;
  lines: Array<string | undefined | null | false>;
}

export function renderPromptSections(sections: PromptSection[]) {
  return sections
    .map((section) => {
      const body = section.lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0).join("\n");
      if (!body) return "";
      return section.title ? `${section.title}\n${body}` : body;
    })
    .filter(Boolean)
    .join("\n\n");
}
