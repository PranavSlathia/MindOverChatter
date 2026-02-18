module.exports = [
  {
    type: "input",
    name: "name",
    message: "Service name (kebab-case):",
  },
  {
    type: "input",
    name: "port",
    message: "Port number:",
  },
  {
    type: "input",
    name: "description",
    message: "Short description:",
  },
  {
    type: "confirm",
    name: "needsGpu",
    message: "Requires GPU?",
    initial: false,
  },
  {
    type: "confirm",
    name: "needsAudioVolume",
    message: "Needs access to audio volume?",
    initial: false,
  },
];
