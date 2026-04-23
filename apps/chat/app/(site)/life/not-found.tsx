import Link from "next/link";

export default function LifeNotFound() {
  return (
    <div className="life-landing">
      <div className="life-landing__inner life-landing__notfound">
        <h1>That Life project doesn't exist yet.</h1>
        <p>
          Try one of the seeded projects below, or head back to the index to
          pick another.
        </p>
        <Link href="/life" className="life-landing__card-cta">
          ◂ Back to /life
        </Link>
      </div>
    </div>
  );
}
