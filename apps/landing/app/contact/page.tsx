import Link from "next/link";
import { Mail, Github, Linkedin, Link2, MessageCircle } from "lucide-react";
import { PageHero } from "@/app/components/page-hero";
import { TopNav } from "@/app/components/top-nav";

const contactLinks = [
	{
		icon: Mail,
		label: "Email",
		handle: "hi@broomva.tech",
		href: "mailto:hi@broomva.tech",
		description: "Best for collaboration or consulting inquiries.",
	},
	{
		icon: MessageCircle,
		label: "WhatsApp",
		handle: "+1 985 332 3941",
		href: "https://api.whatsapp.com/send/?phone=19853323941&text=Hi%20there!",
		description: "Fastest route for quick coordination.",
	},
	{
		icon: Github,
		label: "GitHub",
		handle: "github.com/broomva",
		href: "https://github.com/broomva",
		description: "Repos, experiments, and OSS releases.",
	},
	{
		icon: Linkedin,
		label: "LinkedIn",
		handle: "Carlos Escobar-Valbuena",
		href: "https://www.linkedin.com/in/broomva/",
		description: "Professional background and updates.",
	},
	{
		icon: Link2,
		label: "Link hub",
		handle: "hi.broomva.tech",
		href: "https://hi.broomva.tech",
		description: "All current public links in one place.",
	},
];

export const metadata = {
	title: "Contact",
	description: "Ways to collaborate with Carlos Escobar-Valbuena.",
};

export default function ContactPage() {
	return (
		<div className="min-h-screen bg-black text-zinc-100">
			<TopNav />
			<main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
				<PageHero
					title="Contact"
					description="If you are building AI-native products, agent workflows, or harness infrastructure, send context and your current bottleneck."
				/>
				<section className="mt-10 grid gap-4 md:grid-cols-2">
					{contactLinks.map((item) => {
						const Icon = item.icon;

						return (
							<Link
								key={item.href}
								href={item.href}
								target="_blank"
								className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-zinc-900"
							>
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="text-xs uppercase tracking-[0.18em] text-zinc-400">{item.label}</p>
										<p className="mt-2 font-display text-2xl text-zinc-100">{item.handle}</p>
										<p className="mt-3 text-sm leading-relaxed text-zinc-300">{item.description}</p>
									</div>
									<span className="rounded-full border border-zinc-700 p-2 text-zinc-200">
										<Icon size={18} />
									</span>
								</div>
							</Link>
						);
					})}
				</section>
			</main>
		</div>
	);
}
