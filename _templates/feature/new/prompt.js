module.exports = [
  {
    type: "input",
    name: "name",
    message: "Feature name (kebab-case):",
  },
  {
    type: "confirm",
    name: "withWebSocket",
    message: "Uses WebSocket for real-time data?",
    initial: false,
  },
  {
    type: "confirm",
    name: "withStore",
    message: "Needs Zustand store?",
    initial: true,
  },
];
