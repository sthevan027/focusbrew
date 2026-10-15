import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Features } from "./components/Features";
import { Panel } from "./components/Panel";
import { Privacy } from "./components/Privacy";
import { Install } from "./components/Install";
import { Changelog } from "./components/Changelog";
import { Footer } from "./components/Footer";
import { useReleases } from "./lib/useReleases";

export default function App() {
  const releases = useReleases();
  const list = releases.status === "ready" ? releases.releases : undefined;
  return (
    <div>
      <Header release={list?.[0]} />
      <main>
        <Hero release={list?.[0]} />
        <Features />
        <Panel />
        <Privacy />
        <Install />
        <Changelog releases={list} />
      </main>
      <Footer />
    </div>
  );
}
