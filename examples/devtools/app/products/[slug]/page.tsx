import type { PageProps } from 'tinyjs/routing';

export default function Product({ params }: PageProps) {
  return <>
    <h1>Product {params.slug}</h1>
    <p>This page is nested inside the catalog and application layouts.</p>
  </>;
}
