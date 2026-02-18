module.exports = [
  {
    type: "input",
    name: "name",
    message: "Route name (kebab-case):",
  },
  {
    type: "select",
    name: "methods",
    message: "HTTP methods:",
    choices: ["GET+POST", "GET only", "POST only", "CRUD (GET+POST+PUT+DELETE)"],
  },
  {
    type: "confirm",
    name: "withAuth",
    message: "Requires auth middleware?",
    initial: false,
  },
];
