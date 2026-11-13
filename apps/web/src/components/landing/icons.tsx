import { Icon, type IconName } from "@/components/icons/Icon";
import type { ApplicationIcon } from "./site";

const names: Record<ApplicationIcon, IconName> = {
  family: "contacts",
  occasion: "calendar",
  child: "account",
  distance: "delivery",
  milestone: "capsule",
  letter: "letter",
  media: "photo",
};

export function AppIcon({ name }: { name: ApplicationIcon }) {
  return <Icon name={names[name]} />;
}
