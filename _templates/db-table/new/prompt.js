module.exports = [
  {
    type: "input",
    name: "name",
    message: "Table name (kebab-case, will be snake_cased in DB):",
  },
  {
    type: "confirm",
    name: "withUserId",
    message: "Has user_id foreign key?",
    initial: true,
  },
  {
    type: "confirm",
    name: "withSessionId",
    message: "Has session_id foreign key?",
    initial: true,
  },
  {
    type: "confirm",
    name: "withEmbedding",
    message: "Has vector embedding column?",
    initial: false,
  },
];
