import { Header } from "@/components/Header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="tartan-rule" />
      <Header />
      <main className="flex-1 bg-ground">{children}</main>
    </>
  );
}
