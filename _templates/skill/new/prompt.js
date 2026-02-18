module.exports = [
  {
    type: "input",
    name: "name",
    message: "Skill name (kebab-case):",
  },
  {
    type: "input",
    name: "title",
    message: "Human-readable title:",
  },
  {
    type: "select",
    name: "category",
    message: "Category:",
    choices: [
      "therapeutic-technique",
      "conversational-style",
      "assessment",
      "safety",
      "cultural-adaptation",
    ],
  },
  {
    type: "input",
    name: "description",
    message: "One-line description:",
  },
];
