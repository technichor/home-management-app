import MealsNav from "@/components/MealsNav";

export default function MealsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MealsNav />
      {children}
    </>
  );
}
