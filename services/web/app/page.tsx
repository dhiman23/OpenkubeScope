import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { ScrollSections } from "@/components/landing/scroll-sections"
import { Features } from "@/components/landing/features"
import { Pricing } from "@/components/landing/pricing"
import { Testimonials } from "@/components/landing/testimonials"
import { Footer } from "@/components/landing/footer"

export default function LandingPage() {
  return (
    <main className="relative min-h-screen">
      <Navbar />
      <Hero />
      <ScrollSections />
      <Features />
      <Pricing />
      <Testimonials />
      <Footer />
    </main>
  )
}
