import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="card center">
      <h2>404 – Page not found</h2>
      <Link className="btn btn-primary" to="/">Back to home</Link>
    </section>
  );
}
