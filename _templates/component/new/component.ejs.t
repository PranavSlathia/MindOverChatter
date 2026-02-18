---
to: apps/web/src/components/<%= name %>.tsx
---
interface <%= h.PascalCase(name) %>Props {
  // TODO: define props
}

export function <%= h.PascalCase(name) %>({ }: <%= h.PascalCase(name) %>Props) {
  return (
    <div>
      {/* TODO: implement */}
    </div>
  );
}
