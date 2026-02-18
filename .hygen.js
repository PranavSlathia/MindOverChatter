module.exports = {
  templates: "_templates",
  helpers: {
    camelCase: (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    PascalCase: (s) => s.replace(/(^|-)([a-z])/g, (_, _2, c) => c.toUpperCase()),
    snake_case: (s) => s.replace(/-/g, "_"),
    UPPER_SNAKE: (s) => s.replace(/-/g, "_").toUpperCase(),
  },
};
