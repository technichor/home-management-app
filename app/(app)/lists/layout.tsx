import ListsNav from "@/components/ListsNav";

export default async function ListsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ListsNav />
      {children}
    </>
  );
}
