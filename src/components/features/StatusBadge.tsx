import { Badge } from "@/components/ui/badge";
import { STATUS_STYLE, STATUS_TEXT } from "@/lib/utils/index";

export default function StatusBadge({ status }: { status: string }) {
  const label = STATUS_TEXT[status] ?? "Under Review";
  let variant: "secondary" | "outline" | "default" = "secondary";
  if (status === "done") variant = "default";
  if (status === "open") variant = "outline";
  return (
    <Badge variant={variant} className={`font-medium text-[10pt] px-2 py-1 border-none ` + STATUS_STYLE[status]}>
      {label}
    </Badge>
  );
}
