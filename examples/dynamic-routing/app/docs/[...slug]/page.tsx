import type { PageProps } from "tinyjs/routing";
export default function Docs({params}: PageProps) { return <h1>Docs: {Array.isArray(params.slug) ? params.slug.join(" / ") : params.slug}</h1>; }
