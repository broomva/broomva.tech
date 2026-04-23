import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="life-landing">
      <div className="life-landing__inner life-landing__notfound">
        <h1>Project not found</h1>
        <p>
          Only the seeded demo projects (sentinel, materiales) are available
          today. User-created projects ship in Phase C.
        </p>
        <Link href="/life" className="life-landing__card-cta">
          ◂ Back to /life
        </Link>
      </div>
    </div>
  );
}
