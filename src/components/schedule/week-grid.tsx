"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AlertTriangle, CheckCircle2, Plus, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { moveShiftAction } from "@/app/app/schedule/actions";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { ShiftDialog, type ShiftFormDefaults } from "./shift-dialog";

export type GridShift = {
  id: string;
  employeeId: string | null;
  date: string;
  start: string;
  end: string;
  label: string;
  paidMinutes: number;
  breakMinutes: number;
  positionId: string | null;
  positionName: string | null;
  color: string;
  locationId: string;
  locationName: string;
  notes: string | null;
  status: "DRAFT" | "PUBLISHED";
  confirmed: boolean;
  recurring: boolean;
  warnings: string[];
  pendingClaims: number;
  pendingSwap: boolean;
};

export type GridEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  color: string;
  positionName: string | null;
  hourlyCost: number;
};

export type GridProps = {
  days: { key: string; label: string; sub: string; holiday: string | null }[];
  employees: GridEmployee[];
  shifts: GridShift[];
  leave: { employeeId: string; date: string; label: string }[];
  locations: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  defaultLocationId: string;
  canOpenShifts: boolean;
  canRecurring: boolean;
};

const OPEN = "__open__";

function fmtHours(min: number) {
  return `${Math.round((min / 60) * 10) / 10}h`;
}

function ShiftChip({ shift, onClick }: { shift: GridShift; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: shift.id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeftColor: shift.color,
      }}
      className={cn(
        "bg-card w-full cursor-grab touch-none rounded-md border border-l-4 px-2 py-1 text-left text-xs shadow-xs active:cursor-grabbing",
        shift.status === "DRAFT" && "bg-muted/40 border-dashed",
        isDragging && "z-50 opacity-80 shadow-lg",
      )}
      data-testid="shift-chip"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="tabular font-medium">{shift.label}</span>
        <span className="flex items-center gap-0.5">
          {shift.recurring ? <Repeat className="text-muted-foreground size-3" /> : null}
          {shift.confirmed ? <CheckCircle2 className="text-success size-3" /> : null}
          {shift.warnings.length ? <AlertTriangle className="text-warning size-3" /> : null}
        </span>
      </div>
      <div className="text-muted-foreground truncate">
        {shift.positionName ?? shift.locationName}
        {shift.status === "DRAFT" ? " · draft" : ""}
        {shift.pendingClaims ? ` · ${shift.pendingClaims} claim${shift.pendingClaims > 1 ? "s" : ""}` : ""}
        {shift.pendingSwap ? " · swap requested" : ""}
      </div>
      {shift.warnings.length ? (
        <div className="text-warning truncate text-[10px]">{shift.warnings[0]}</div>
      ) : null}
    </button>
  );
}

function Cell({
  id,
  children,
  onAdd,
  highlight,
}: {
  id: string;
  children: React.ReactNode;
  onAdd: () => void;
  highlight?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative min-h-16 space-y-1 border-l p-1",
        isOver && "bg-primary-soft/50",
        highlight && "bg-amber-50/60 dark:bg-amber-950/20",
      )}
    >
      {highlight ? (
        <div className="truncate rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-900 dark:text-amber-100">
          {highlight}
        </div>
      ) : null}
      {children}
      <button
        onClick={onAdd}
        className="text-muted-foreground hover:bg-muted flex w-full items-center justify-center rounded-md py-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Add shift"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function WeekGrid(props: GridProps) {
  const router = useRouter();
  const [shifts, setShifts] = useState(props.shifts);
  const [dialog, setDialog] = useState<ShiftFormDefaults | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Keep local state in sync after server refreshes.
  const [prev, setPrev] = useState(props.shifts);
  if (prev !== props.shifts) {
    setPrev(props.shifts);
    setShifts(props.shifts);
  }

  const rows = useMemo(() => {
    const list: { id: string; employee: GridEmployee | null }[] = [];
    if (props.canOpenShifts || shifts.some((s) => !s.employeeId)) list.push({ id: OPEN, employee: null });
    for (const e of props.employees) list.push({ id: e.id, employee: e });
    return list;
  }, [props.employees, props.canOpenShifts, shifts]);

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const [rowId, date] = String(e.over.id).split("|") as [string, string];
    const shift = shifts.find((s) => s.id === e.active.id);
    if (!shift) return;
    const employeeId = rowId === OPEN ? null : rowId;
    if (shift.employeeId === employeeId && shift.date === date) return;
    if (!employeeId && !props.canOpenShifts) return toast.error("Open shifts need the Starter plan.");
    const before = shifts;
    setShifts((list) =>
      list.map((s) => (s.id === shift.id ? { ...s, employeeId, date, confirmed: false } : s)),
    );
    const r = await moveShiftAction(shift.id, employeeId, date);
    if (!r.ok) {
      setShifts(before);
      toast.error(r.error);
    } else router.refresh();
  }

  function openNew(rowId: string, date: string) {
    setDialog({
      date,
      start: "08:00",
      end: "17:00",
      breakMinutes: 60,
      employeeId: rowId === OPEN ? null : rowId,
      locationId: props.defaultLocationId,
      positionId: null,
      notes: "",
    });
  }

  function openEdit(s: GridShift) {
    setDialog({
      id: s.id,
      date: s.date,
      start: s.start,
      end: s.end,
      breakMinutes: s.breakMinutes,
      employeeId: s.employeeId,
      locationId: s.locationId,
      positionId: s.positionId,
      notes: s.notes ?? "",
      recurring: s.recurring,
    });
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="bg-card overflow-x-auto rounded-lg border">
          <div
            className="grid min-w-[980px]"
            style={{ gridTemplateColumns: "200px repeat(7, minmax(110px, 1fr))" }}
          >
            <div className="bg-muted/50 text-muted-foreground sticky left-0 z-10 border-b p-2 text-xs font-medium">
              Team · week hours
            </div>
            {props.days.map((d) => (
              <div
                key={d.key}
                className={cn(
                  "bg-muted/50 border-b border-l p-2 text-center",
                  d.holiday && "bg-amber-50 dark:bg-amber-950/30",
                )}
              >
                <div className="text-xs font-semibold">{d.label}</div>
                <div className="text-muted-foreground text-[11px]">{d.sub}</div>
                {d.holiday ? (
                  <div className="truncate text-[10px] text-amber-700 dark:text-amber-300">{d.holiday}</div>
                ) : null}
              </div>
            ))}
            {rows.map((row) => {
              const rowShifts = shifts.filter((s) =>
                row.employee ? s.employeeId === row.employee.id : !s.employeeId,
              );
              const minutes = rowShifts.reduce((t, s) => t + s.paidMinutes, 0);
              const cost = row.employee ? (minutes / 60) * row.employee.hourlyCost : 0;
              return (
                <div key={row.id} className="contents">
                  <div className="bg-card sticky left-0 z-10 flex items-center gap-2 border-b p-2">
                    {row.employee ? (
                      <>
                        <Avatar
                          firstName={row.employee.firstName}
                          lastName={row.employee.lastName}
                          color={row.employee.color}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {row.employee.firstName} {row.employee.lastName}
                          </div>
                          <div className="tabular text-muted-foreground truncate text-[11px]">
                            {fmtHours(minutes)}
                            {minutes > 48 * 60 ? " · over 48h" : ""} · ₱
                            {Math.round(cost / 100).toLocaleString()}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <div className="text-sm font-medium">Open shifts</div>
                        <div className="text-muted-foreground text-[11px]">Anyone can claim</div>
                      </div>
                    )}
                  </div>
                  {props.days.map((d) => {
                    const cellShifts = rowShifts.filter((s) => s.date === d.key);
                    const leave = row.employee
                      ? props.leave.find((l) => l.employeeId === row.employee!.id && l.date === d.key)
                      : null;
                    return (
                      <div key={d.key} className="border-b">
                        <Cell
                          id={`${row.id}|${d.key}`}
                          onAdd={() => openNew(row.id, d.key)}
                          highlight={leave?.label}
                        >
                          {cellShifts.map((s) => (
                            <ShiftChip key={s.id} shift={s} onClick={() => openEdit(s)} />
                          ))}
                        </Cell>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </DndContext>
      {dialog ? (
        <ShiftDialog
          defaults={dialog}
          onClose={() => setDialog(null)}
          employees={props.employees}
          locations={props.locations}
          positions={props.positions}
          canOpenShifts={props.canOpenShifts}
          canRecurring={props.canRecurring}
        />
      ) : null}
    </>
  );
}
