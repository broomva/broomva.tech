import Link from "next/link";
import Particles from "./components/particles";

const navigation = [
  { name: "Let's speak 🚀", href: "/contact" },
  { name: "Chat with Vortex 🌪️", href: "https://api.whatsapp.com/send/?phone=19853323941&text=Hi%20there!" },
];

export default function Home() {
  return (
    
    <div className="flex flex-col items-center justify-center w-screen h-screen overflow-hidden bg-gradient-to-tl from-black via-zinc-600/20 to-black">
      <nav className="my-16 animate-fade-out">
        <ul className="flex items-center justify-center gap-4">
          {navigation.map((item) => (
            <Link
            key={item.href}
            href={item.href}
            className="text-lg duration-500 text-zinc-500 hover:text-zinc-300"
          >
            {item.name}
          </Link>
          ))}
        </ul>
      </nav>
      <div className="hidden w-screen h-px animate-glow md:block animate-fade-left bg-gradient-to-r from-zinc-300/0 via-zinc-300/50 to-zinc-300/0" />
      <Particles
        className="absolute inset-0 -z-10"
        quantity={420}
      />
      <h3 className="z-10 text-2xl text-transparent duration-1000 bg-white cursor-default text-edge-outline e font-display sm:text-4xl md:text-7xl whitespace-nowrap bg-clip-text ">
      broomva
    </h3>
    <br />
    <h1 className="z-10 text-3xl text-transparent duration-1000 bg-white cursor-default text-edge-outline font-display sm:text-5xl md:text-8xl whitespace-nowrap bg-clip-text ">
  Carlos D. Escobar-Valbuena
</h1>
<br />
      <div className="flex flex-col items-center justify-center text-center">
  <span className="text-2xl sm:text-5xl md:text-7xl text-transparent duration-1000 bg-white cursor-default text-edge-outline  font-display whitespace-nowrap bg-clip-text ">
    Senior ML Engineer
  </span>

</div>

      <div className="hidden w-screen h-px animate-glow md:block animate-fade-right bg-gradient-to-r from-zinc-300/0 via-zinc-300/50 to-zinc-300/0" />
      <div className="my-16 text-center animate-fade-in">
        <h2 className="text-sm text-zinc-500 ">
          AI | Smart Agents & LLMs | Blockchain | Quantum | Working on {" "}
          <Link
            target="_blank"
            href="https://vortex.broomva.tech"
            className="underline duration-500 hover:text-zinc-300"
          >
            Vortex
          </Link> | <Link
            target="_blank"
            href="https://arcanai.tech"
            className="underline duration-500 hover:text-zinc-300"
          >
            Arcan
          </Link> | <Link
            target="_blank"
            href="https://github.com/broomva"
            className="underline duration-500 hover:text-zinc-300"
          >
            Github
          </Link> | <Link
            target="_blank"
            href="https://huggingface.co/Broomva"
            className="underline duration-500 hover:text-zinc-300"
          >
            HuggingFace
          </Link> | <Link
            target="_blank"
            href="https://book.broomva.tech"
            className="underline duration-500 hover:text-zinc-300"
          >
            Book
          </Link> | <Link
            target="_blank"
            href="https://www.linkedin.com/in/broomva/"
            className="underline duration-500 hover:text-zinc-300"
          >
            Connect on LinkedIn
          </Link>
        </h2>
      </div>
    </div>
  );

}
