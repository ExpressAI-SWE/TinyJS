// Tell TypeScript that generated JSX documentation exports a Preact component.
declare module '*.jsx' {
  const Content: import('preact').ComponentType;
  export default Content;
}
