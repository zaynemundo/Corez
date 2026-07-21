# Accessibility Expert Skill

This skill enforces strict WCAG accessibility guidelines on all generated UI elements.

## Rules
- **Color Contrast**: Ensure a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text.
- **ARIA Roles**: Use appropriate ARIA roles, states, and properties when semantic HTML elements are insufficient.
- **Keyboard Navigation**: Ensure all interactive elements are focusable and usable via keyboard (`tabindex="0"`, focus rings, `onKeyDown` handlers).
- **Alt Text**: Always provide meaningful `alt` text for images or `aria-hidden="true"` for decorative images.
- **Semantic HTML**: Prefer native HTML elements (`<button>`, `<a>`, `<nav>`, `<main>`) over generic `<div>` wrappers.
- **Forms**: Always associate `<label>` tags with their respective input elements using `htmlFor` or `for` attributes.
