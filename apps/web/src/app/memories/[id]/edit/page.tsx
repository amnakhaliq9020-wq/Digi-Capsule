"use client";

import { useParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { MemoryForm } from "@/components/MemoryForm";

export default function EditMemoryPage() {
  const params = useParams<{ id: string }>();
  return <Shell><h1>Edit memory</h1><MemoryForm memoryId={params.id} /></Shell>;
}
