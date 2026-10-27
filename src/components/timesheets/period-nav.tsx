import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { addDays, formatKey } from "@/lib/time";

export function PeriodNav({
  base,
  start,
  end,
  isCurrent,
}: {
  base: string;
  start: string;
  end: string;
  isCurrent: boolean;
}) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label="Previous period">
        <Link href={`${base}${sep}start=${addDays(start, -1)}`}>
          <ChevronLeft />
        </Link>
      </Button>
      <span className="min-w-44 text-center text-sm font-medium">
        {formatKey(start, { month: "short", day: "numeric" })} –{" "}
        {formatKey(end, { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <Button asChild variant="outline" size="icon" aria-label="Next period">
        <Link href={`${base}${sep}start=${addDays(end, 1)}`}>
          <ChevronRight />
        </Link>
      </Button>
      {!isCurrent ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={base}>Current</Link>
        </Button>
      ) : null}
    </div>
  );
}
