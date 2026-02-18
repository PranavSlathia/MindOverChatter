---
to: apps/web/src/pages/<%= name %>.tsx
---
<% const Component = h.PascalCase(name) %>
<% const hook = 'use' + Component %>
import { <%= hook %> } from "@/hooks/<%= hook %>";
<% if (withStore) { %>
import { use<%= Component %>Store } from "@/stores/<%= name %>-store";
<% } %>

export function <%= Component %>Page() {
  const { data, isLoading, error } = <%= hook %>();
<% if (withStore) { %>
  const store = use<%= Component %>Store();
<% } %>

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (error) {
    return <div className="text-destructive">Error: {error.message}</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold"><%= Component.replace(/([A-Z])/g, ' $1').trim() %></h1>
      {/* TODO: implement */}
    </div>
  );
}
