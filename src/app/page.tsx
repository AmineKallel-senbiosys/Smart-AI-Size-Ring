import { VeliaPdp } from "@/components/velia/VeliaPdp";

type Props = {
  searchParams?: Promise<{ size?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const openSizingOnMount = params.size === "open";
  return <VeliaPdp openSizingOnMount={openSizingOnMount} />;
}
