import type { PageProps } from 'tinyjs/routing';

export const metadata = { title: 'User profile', description: 'Dynamic TinyJS route' };

export default function User({ params, query }: PageProps) {
  return <main>
    <h1>User {params.id}</h1>
    <p>Filter: {query.filter}</p>
    <a href="/">Home</a>
  </main>;
}
